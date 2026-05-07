// Investigation mode: scan a folder of logs, run the analyzer, return a structured report.
import fs from 'fs';
import path from 'path';
import { readLines } from './streaming.js';
import { parseStream } from './parser.js';
import { Aggregator, rootCauseHints } from './analyzer.js';

const TEXT_EXT = new Set(['.log', '.txt', '.json', '.ndjson', '.out', '.err', '']);

export async function listLogFiles(root, { maxFiles = 200, maxBytes = 5 * 1024 * 1024 * 1024 } = {}) {
  const out = [];
  let bytes = 0;
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        stack.push(p);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (!TEXT_EXT.has(ext)) continue;
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.size === 0) continue;
        if (bytes + st.size > maxBytes) continue;
        bytes += st.size;
        out.push({ path: p, size: st.size, name: path.relative(root, p) });
        if (out.length >= maxFiles) break;
      }
    }
  }
  return out;
}

export async function investigate(root) {
  const files = await listLogFiles(root);
  const agg = new Aggregator();
  const perFileLevels = new Map(); // name -> { LEVEL: count }
  for (const f of files) {
    const levels = {};
    perFileLevels.set(f.name, levels);
    try {
      for await (const rec of parseStream(readLines(f.path), { file: f.name })) {
        agg.add(rec);
        const l = rec.level || 'UNKNOWN';
        levels[l] = (levels[l] || 0) + 1;
      }
    } catch (err) {
      console.warn('skip', f.path, err.message);
    }
  }
  const summary = agg.summary();
  const hints = rootCauseHints(summary.topErrors);
  const fileSummaries = files.map(f => ({
    name: f.name, size: f.size,
    levels: perFileLevels.get(f.name) || {},
  }));
  return {
    root,
    fileCount: files.length,
    files: fileSummaries,
    summary,
    rootCauseHints: hints,
    recordCount: agg.total,
    // Return the full aggregator buffer (already capped at 100k inside Aggregator)
    // so the session can serve filter/file/level queries consistently with the
    // summary counts. Slicing here caused "ERROR=67 but only 15 visible".
    sampleRecords: agg.records,
  };
}
