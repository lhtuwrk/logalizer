import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';

import AdmZip from 'adm-zip';
import { extract as tarExtract } from 'tar';
import { readLines, readGzipLines, iterText } from './lib/streaming.js';
import { parseStream } from './lib/parser.js';
import { Aggregator, filterRecords, rootCauseHints } from './lib/analyzer.js';
import { investigate, listLogFiles } from './lib/investigator.js';
import { createSession, getSession, deleteSession, listSessions } from './lib/sessions.js';
import { toJSON, toCSV, toReportHTML } from './lib/export.js';
import { buildCustomParser, previewCustomParser } from './lib/customParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '200mb', type: ['text/plain', 'application/x-log'] }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^\w.\-]/g, '_')),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB per file
});

// --- Helpers ----------------------------------------------------------------

const LOG_EXT = /\.(log|txt|json|jsonl|ndjson|out|csv)$/i;

// Expand a .zip into individual log files written to destDir.
function expandZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const expanded = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (!LOG_EXT.test(name) && !name.toLowerCase().endsWith('.gz')) continue;
    const safeName = name.replace(/[^\w.\-/]/g, '_');
    const dest = path.join(destDir, Date.now() + '-' + path.basename(safeName));
    fs.writeFileSync(dest, entry.getData());
    const lower = path.basename(name).toLowerCase();
    expanded.push({ name: path.basename(name), size: entry.header.size, path: dest, gz: lower.endsWith('.gz') && !lower.endsWith('.tar.gz'), _tmp: true });
  }
  return expanded;
}

// Extract a .tar.gz / .tgz into individual log files written to destDir.
async function expandTarGz(tgzPath, destDir) {
  const expanded = [];
  await tarExtract({
    file: tgzPath,
    cwd: destDir,
    filter: (p) => LOG_EXT.test(p) || p.toLowerCase().endsWith('.gz'),
    onentry: (entry) => {
      if (entry.type !== 'File') return;
      const base = path.basename(entry.path);
      const safeName = Date.now() + '-' + base.replace(/[^\w.\-]/g, '_');
      const dest = path.join(destDir, safeName);
      const lower = base.toLowerCase();
      expanded.push({ name: base, size: entry.size, path: dest, gz: lower.endsWith('.gz') && !lower.endsWith('.tar.gz'), _tmp: true });
    },
  });
  return expanded;
}

// Resolve any archives (.zip, .tar.gz, .tgz, .gz) into a flat list of
// { name, size, path, gz, _tmp } descriptors ready for parsing.
async function expandFiles(files) {
  const out = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const inner = expandZip(f.path, UPLOAD_DIR);
      out.push(...(inner.length ? inner : [f]));
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      const inner = await expandTarGz(f.path, UPLOAD_DIR);
      out.push(...(inner.length ? inner : [f]));
    } else if (lower.endsWith('.gz')) {
      // Plain gzip — stream-decompress during parsing, no temp extraction needed.
      out.push({ ...f, gz: true });
    } else {
      out.push(f);
    }
  }
  return out;
}

// Parse all files in an expanded list into an Aggregator.
async function parseFiles(expanded, agg, customParser = null) {
  for (const f of expanded) {
    const lines = f.gz ? readGzipLines(f.path) : readLines(f.path);
    const logName = f.gz ? f.name.replace(/\.gz$/i, '') : f.name;
    for await (const rec of parseStream(lines, { file: logName, customParser })) {
      agg.add(rec);
    }
  }
}

async function buildSession({ source, files }) {
  const expanded = await expandFiles(files);

  const agg = new Aggregator();
  await parseFiles(expanded, agg);

  // Keep file paths so the user can later re-parse with a custom format spec.
  // These are removed when the session is deleted (see sessions.js).
  const rawFiles = expanded.map(f => ({
    name: f.gz ? f.name.replace(/\.gz$/i, '') : f.name,
    path: f.path,
    gz: !!f.gz,
  }));

  return createSession({
    source,
    files: expanded.map(f => ({ name: f.gz ? f.name.replace(/\.gz$/i, '') : f.name, size: f.size })),
    records: agg.records,
    aggregator: agg,
    rawFiles,
  });
}

function summaryWithHints(agg) {
  const summary = agg.summary();
  return { ...summary, rootCauseHints: rootCauseHints(summary.topErrors) };
}

// --- Routes -----------------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true, sampleDir: SAMPLE_DIR, sampleExists: fs.existsSync(SAMPLE_DIR) }));

// Paste raw text -> create session
app.post('/api/sessions/text', async (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : (req.body?.text ?? '');
    if (!text) return res.status(400).json({ error: 'No text provided' });
    const agg = new Aggregator();
    for await (const rec of parseStream(iterText(text), { file: 'pasted.log' })) agg.add(rec);
    const id = createSession({
      source: { kind: 'paste' },
      files: [{ name: 'pasted.log', size: Buffer.byteLength(text) }],
      records: agg.records,
      aggregator: agg,
      rawFiles: [{ name: 'pasted.log', text }],
    });
    res.json({ sessionId: id, summary: summaryWithHints(agg), recordCount: agg.total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload one or many files (multipart) -> create session
app.post('/api/sessions/upload', upload.array('files', 50), async (req, res) => {
  try {
    const files = (req.files || []).map(f => ({
      name: f.originalname,
      size: f.size,
      path: f.path,
    }));
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
    const id = await buildSession({ source: { kind: 'upload' }, files });
    const s = getSession(id);
    res.json({ sessionId: id, summary: summaryWithHints(s.aggregator), recordCount: s.aggregator.total, files: s.files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analyze a server-side folder path -> create session
app.post('/api/sessions/folder', async (req, res) => {
  try {
    const { folder } = req.body || {};
    if (!folder) return res.status(400).json({ error: 'folder required' });
    const abs = path.resolve(folder);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'folder not found' });
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'not a directory' });
    const list = await listLogFiles(abs);
    const id = await buildSession({ source: { kind: 'folder', path: abs }, files: list });
    const s = getSession(id);
    res.json({ sessionId: id, summary: summaryWithHints(s.aggregator), recordCount: s.aggregator.total, files: s.files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Investigate any folder
app.post('/api/investigate', async (req, res) => {
  try {
    const { folder } = req.body || {};
    if (!folder) return res.status(400).json({ error: 'folder required' });
    const abs = path.resolve(folder);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'folder not found' });
    const report = await investigate(abs);
    const id = createSession({
      source: { kind: 'folder', path: abs },
      files: report.files.map(f => ({ name: f.name, size: f.size })),
      records: report.sampleRecords,
      aggregator: rebuildAggregator(report.sampleRecords),
    });
    const { sampleRecords, ...reportNoRecords } = report;
    res.json({ sessionId: id, report: reportNoRecords });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lightweight rebuild for sessions stored from investigate (we already have records)
function rebuildAggregator(records) {
  const agg = new Aggregator();
  for (const r of records) agg.add(r);
  return agg;
}

// Get session metadata + summary
app.get('/api/sessions/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json({
    id: s.id, source: s.source, files: s.files,
    recordCount: s.aggregator.total,
    summary: summaryWithHints(s.aggregator),
  });
});

// Query records (filter + paginate)
app.get('/api/sessions/:id/records', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const { offset = '0', limit = '500', sort } = req.query;
  const filtered = filterRecords(s.records, { ...parseQueryFilter(req.query), sort: sort || null });
  const start = Math.max(0, parseInt(offset));
  const lim = Math.min(5000, Math.max(1, parseInt(limit)));
  res.json({
    total: filtered.length,
    offset: start,
    limit: lim,
    records: filtered.slice(start, start + lim),
  });
});

// Get a single record + N-line context window from the raw session records.
app.get('/api/sessions/:id/context', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const lineNo = Number(req.query.lineNo);
  const file = req.query.file;
  const radius = Math.min(50, Math.max(1, Number(req.query.radius) || 5));
  if (!Number.isFinite(lineNo) || !file) return res.status(400).json({ error: 'lineNo and file required' });
  const idx = s.records.findIndex(r => r.file === file && r.lineNo === lineNo);
  if (idx < 0) return res.status(404).json({ error: 'record not found' });
  // Collect context within the same file
  const sameFile = s.records.filter(r => r.file === file);
  const i = sameFile.findIndex(r => r.lineNo === lineNo);
  res.json({
    record: sameFile[i],
    before: sameFile.slice(Math.max(0, i - radius), i),
    after: sameFile.slice(i + 1, i + 1 + radius),
  });
});

// Add more files to an existing session (merges into the same aggregator)
app.post('/api/sessions/:id/add-files', upload.array('files', 50), async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  try {
    const newFiles = (req.files || []).map(f => ({ name: f.originalname, size: f.size, path: f.path }));
    if (!newFiles.length) return res.status(400).json({ error: 'No files uploaded' });

    const expanded = await expandFiles(newFiles);
    await parseFiles(expanded, s.aggregator);

    const existingNames = new Set(s.files.map(f => f.name));
    for (const f of expanded) {
      const displayName = f.gz ? f.name.replace(/\.gz$/i, '') : f.name;
      if (!existingNames.has(displayName)) {
        s.files.push({ name: displayName, size: f.size });
        existingNames.add(displayName);
      }
      if (!s.rawFiles) s.rawFiles = [];
      s.rawFiles.push({ name: displayName, path: f.path, gz: !!f.gz });
    }
    res.json({ sessionId: s.id, summary: summaryWithHints(s.aggregator), recordCount: s.aggregator.total, files: s.files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remove one file's records from an existing session
app.delete('/api/sessions/:id/files', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file query param required' });

  const remaining = s.records.filter(r => r.file !== file);
  const newAgg = rebuildAggregator(remaining);
  s.aggregator = newAgg;
  s.records = newAgg.records;
  s.files = s.files.filter(f => f.name !== file);
  if (s.rawFiles) {
    const dropped = s.rawFiles.filter(f => f.name === file);
    for (const d of dropped) if (d.path) { try { fs.unlinkSync(d.path); } catch {} }
    s.rawFiles = s.rawFiles.filter(f => f.name !== file);
  }

  res.json({ sessionId: s.id, summary: summaryWithHints(s.aggregator), recordCount: s.aggregator.total, files: s.files });
});

// Return the first N raw lines from each file of a session. Used by the
// "custom parser" UI so the user can pick a representative line to mark up.
app.get('/api/sessions/:id/samples', async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const perFile = Math.min(50, Math.max(1, Number(req.query.perFile) || 20));
  try {
    const out = [];
    for (const f of (s.rawFiles || [])) {
      const lines = [];
      const iter = f.text != null
        ? iterText(f.text)
        : f.gz ? readGzipLines(f.path) : readLines(f.path);
      for await (const line of iter) {
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length >= perFile) break;
      }
      out.push({ file: f.name, lines });
    }
    res.json({ files: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Re-parse the session using a user-defined parser spec.
// Body: { sample: string, spans: [{ field, start, end }] }
// Returns updated summary + record count.
app.post('/api/sessions/:id/reparse', async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  try {
    const { sample, spans } = req.body || {};
    if (typeof sample !== 'string' || !Array.isArray(spans) || spans.length === 0) {
      return res.status(400).json({ error: 'sample and spans[] required' });
    }
    const customParser = buildCustomParser({ sample, spans });

    const agg = new Aggregator();
    for (const f of (s.rawFiles || [])) {
      const iter = f.text != null
        ? iterText(f.text)
        : f.gz ? readGzipLines(f.path) : readLines(f.path);
      for await (const rec of parseStream(iter, { file: f.name, customParser })) {
        agg.add(rec);
      }
    }
    s.aggregator = agg;
    s.records = agg.records;
    s.customParser = { sample, spans, regex: customParser.regexSource };
    res.json({
      sessionId: s.id,
      summary: summaryWithHints(agg),
      recordCount: agg.total,
      regex: customParser.regexSource,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Preview a parser spec against a single line without touching the session.
// Body: { sample, spans, line? } — uses `line` (or `sample`) as the test input.
app.post('/api/parser/preview', (req, res) => {
  try {
    const { sample, spans, line } = req.body || {};
    if (typeof sample !== 'string' || !Array.isArray(spans)) {
      return res.status(400).json({ error: 'sample and spans[] required' });
    }
    const preview = previewCustomParser({ sample, spans }, line || sample);
    res.json(preview);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Sessions list / delete
app.get('/api/sessions', (_req, res) => res.json({ sessions: listSessions() }));
app.delete('/api/sessions/:id', (req, res) => res.json({ deleted: deleteSession(req.params.id) }));

// Export endpoints
app.get('/api/sessions/:id/export.:fmt', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const fmt = req.params.fmt;
  const filtered = filterRecords(s.records, parseQueryFilter(req.query));
  if (fmt === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${s.id}.json"`);
    return res.send(toJSON(filtered));
  }
  if (fmt === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${s.id}.csv"`);
    return res.send(toCSV(filtered));
  }
  if (fmt === 'html' || fmt === 'pdf') {
    const summary = summaryWithHints(s.aggregator);
    const report = {
      root: s.source?.path || s.source?.kind,
      fileCount: s.files.length,
      files: s.files.map(f => ({ ...f, levels: {} })),
      recordCount: s.aggregator.total,
      summary,
      rootCauseHints: summary.rootCauseHints,
    };
    res.setHeader('Content-Type', 'text/html');
    return res.send(toReportHTML(report));
  }
  return res.status(400).json({ error: 'unsupported format' });
});

function parseQueryFilter(q) {
  const files = q.files ? String(q.files).split(',').filter(Boolean)
    : q.file ? [String(q.file)]
    : null;
  return {
    level: q.level ? String(q.level).split(',') : null,
    files: files?.length ? files : null,
    logger: q.logger || null,
    search: q.search || null,
    from: q.from ? Number(q.from) : null,
    to: q.to ? Number(q.to) : null,
  };
}

// --- Static client (production build) --------------------------------------
const clientDist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// --- Server + WebSocket -----------------------------------------------------
const PORT = process.env.PORT || 5174;
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/monitor' });

// Live monitoring: client sends {action:'watch', folder|files} and receives parsed records.
wss.on('connection', (ws) => {
  let watcher = null;
  const fileFormats = new Map(); // path -> detected format
  const fileOffsets = new Map(); // path -> byte offset already read
  const send = (msg) => { try { ws.send(JSON.stringify(msg)); } catch {} };

  ws.on('message', async (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.action === 'watch') {
      const target = msg.folder ? [path.resolve(msg.folder)] : (msg.files || []).map(p => path.resolve(p));
      if (!target.length) return send({ type: 'error', error: 'no target' });
      // Initial scan: send current tail (last 200 lines of each file)
      for (const t of target) {
        if (!fs.existsSync(t)) { send({ type: 'error', error: `not found: ${t}` }); continue; }
        const st = fs.statSync(t);
        if (st.isFile()) {
          fileOffsets.set(t, st.size);
          await tailFile(t, ws, send, fileOffsets, true);
        }
      }
      watcher = chokidar.watch(target, { persistent: true, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200 } });
      watcher.on('add', p => fileOffsets.set(p, 0));
      watcher.on('change', async (p) => {
        await tailFile(p, ws, send, fileOffsets, false);
      });
      send({ type: 'watching', target });
    }
    if (msg.action === 'stop' && watcher) { watcher.close(); send({ type: 'stopped' }); }
  });

  ws.on('close', () => { if (watcher) watcher.close(); });
});

async function tailFile(p, ws, send, offsets, initial) {
  try {
    const st = fs.statSync(p);
    let from = offsets.get(p) ?? 0;
    if (initial) from = Math.max(0, st.size - 64 * 1024); // last 64KB on initial
    if (from > st.size) from = 0; // file truncated/rotated
    if (from === st.size) return;
    const stream = fs.createReadStream(p, { start: from, end: st.size, encoding: 'utf8' });
    let buf = '';
    for await (const chunk of stream) buf += chunk;
    offsets.set(p, st.size);
    const lines = buf.split(/\r?\n/);
    if (!lines[lines.length - 1]) lines.pop();
    async function* iter() { for (const l of lines) yield l; }
    const recs = [];
    for await (const r of parseStream(iter(), { file: path.basename(p) })) recs.push(r);
    send({ type: 'records', file: path.basename(p), records: recs });
  } catch (err) {
    send({ type: 'error', error: err.message });
  }
}

// Export for Electron embedding — Electron calls start() directly
export function start(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[logalizer] api listening on http://localhost:${port}`);
      resolve(port);
    });
  });
}

// Auto-start when run directly (node src/index.js), not when imported by Electron
if (process.env.ELECTRON !== '1') {
  start(PORT);
}
