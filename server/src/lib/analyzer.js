// Analysis engine: runs over a stream of normalized records and produces a summary.
// Also exposes helpers for filtering, search, grouping, and anomaly detection.

const LEVEL_RANK = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5, CRITICAL: 5 };

// Reduce a message to a fingerprint by stripping volatile bits (ids, numbers, hex, urls, paths).
export function fingerprint(msg) {
  if (!msg) return '';
  let s = msg.split('\n')[0]; // first line only
  s = s.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>');
  s = s.replace(/\b0x[0-9a-f]+\b/gi, '<hex>');
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<ip>');
  s = s.replace(/\bhttps?:\/\/\S+/gi, '<url>');
  s = s.replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*/g, '<ts>');
  s = s.replace(/\b\d{10,}\b/g, '<num>');
  s = s.replace(/\b\d+\b/g, '<n>');
  s = s.replace(/(['"])(?:(?=(\\?))\2.)*?\1/g, '<str>');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 240);
}

export function bucketTs(tsMs, bucketMs) {
  if (tsMs == null) return null;
  return Math.floor(tsMs / bucketMs) * bucketMs;
}

export function chooseBucket(spanMs) {
  // Pick a sensible bucket size for the timeline.
  const minute = 60_000;
  if (spanMs <= 5 * minute) return 1_000;       // 1s
  if (spanMs <= 60 * minute) return 10_000;     // 10s
  if (spanMs <= 6 * 60 * minute) return 60_000; // 1m
  if (spanMs <= 24 * 60 * minute) return 5 * minute;
  if (spanMs <= 7 * 24 * 60 * minute) return 30 * minute;
  return 60 * minute;
}

// Aggregator that consumes records one-by-one (streaming-friendly).
export class Aggregator {
  constructor() {
    this.total = 0;
    this.byLevel = {};
    this.byFile = {};
    this.byLogger = {};
    this.minTs = null;
    this.maxTs = null;
    this.errorClusters = new Map();    // fingerprint -> { count, sample, level, files:Set, lastTs }
    this.timeline = new Map();         // tsBucket -> { level: count }
    this.records = [];                 // capped buffer
    this.maxStoredLow = 100_000;       // cap for INFO/DEBUG/TRACE/UNKNOWN
    this._storedLow = 0;
    this.tsList = [];                  // for anomaly detection over error counts
  }

  add(rec) {
    this.total++;
    const lvl = rec.level || 'UNKNOWN';
    this.byLevel[lvl] = (this.byLevel[lvl] || 0) + 1;
    if (rec.file) this.byFile[rec.file] = (this.byFile[rec.file] || 0) + 1;
    if (rec.logger) this.byLogger[rec.logger] = (this.byLogger[rec.logger] || 0) + 1;
    if (rec.ts != null) {
      if (this.minTs == null || rec.ts < this.minTs) this.minTs = rec.ts;
      if (this.maxTs == null || rec.ts > this.maxTs) this.maxTs = rec.ts;
    }
    if ((LEVEL_RANK[lvl] ?? 0) >= LEVEL_RANK.WARN) {
      const fp = fingerprint(rec.message);
      const c = this.errorClusters.get(fp);
      if (c) {
        c.count++;
        c.lastTs = rec.ts ?? c.lastTs;
        if (rec.file) c.files.add(rec.file);
      } else {
        this.errorClusters.set(fp, {
          fingerprint: fp,
          count: 1,
          sample: rec.message.split('\n')[0].slice(0, 500),
          level: lvl,
          files: new Set(rec.file ? [rec.file] : []),
          firstTs: rec.ts ?? null,
          lastTs: rec.ts ?? null,
          firstLine: rec.lineNo,
        });
      }
      if (rec.ts != null) this.tsList.push(rec.ts);
    }
    // Always store WARN/ERROR/FATAL/CRITICAL — users must be able to query every error.
    // Cap INFO/DEBUG/TRACE/UNKNOWN to avoid unbounded memory on large files.
    const rank = LEVEL_RANK[lvl] ?? -1;
    if (rank >= LEVEL_RANK.WARN) {
      this.records.push(rec);
    } else if (this._storedLow < this.maxStoredLow) {
      this._storedLow++;
      this.records.push(rec);
    }
  }

  buildTimeline() {
    if (this.minTs == null || this.maxTs == null) return { bucketMs: 0, buckets: [] };
    const span = Math.max(1, this.maxTs - this.minTs);
    const bucketMs = chooseBucket(span);
    const map = new Map();
    for (const r of this.records) {
      if (r.ts == null) continue;
      const b = bucketTs(r.ts, bucketMs);
      if (!map.has(b)) map.set(b, { ts: b, total: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0, DEBUG: 0, TRACE: 0, UNKNOWN: 0 });
      const cell = map.get(b);
      cell.total++;
      const lvl = r.level || 'UNKNOWN';
      cell[lvl] = (cell[lvl] || 0) + 1;
    }
    const buckets = [...map.values()].sort((a, b) => a.ts - b.ts);
    return { bucketMs, buckets };
  }

  detectAnomalies() {
    // Bucket error/warn counts by 1-minute (or chosen) slots and flag spikes > mean + 3*stddev.
    if (this.tsList.length < 10) return [];
    const span = (this.maxTs ?? 0) - (this.minTs ?? 0);
    const bucketMs = chooseBucket(span || 60000);
    const counts = new Map();
    for (const t of this.tsList) {
      const b = bucketTs(t, bucketMs);
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    const arr = [...counts.entries()].sort((a, b) => a[0] - b[0]);
    const values = arr.map(([, v]) => v);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const threshold = mean + 3 * stddev;
    const minSignificant = Math.max(5, mean * 2);
    return arr
      .filter(([, v]) => v >= threshold && v >= minSignificant)
      .map(([ts, v]) => ({ ts, count: v, threshold: Math.round(threshold * 10) / 10, kind: 'spike' }));
  }

  topErrors(limit = 20) {
    return [...this.errorClusters.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(c => ({ ...c, files: [...c.files] }));
  }

  summary() {
    return {
      total: this.total,
      stored: this.records.length,
      truncated: this._storedLow >= this.maxStoredLow,
      byLevel: this.byLevel,
      byFile: this.byFile,
      byLogger: Object.fromEntries(
        Object.entries(this.byLogger).sort((a, b) => b[1] - a[1]).slice(0, 30)
      ),
      timeRange: { min: this.minTs, max: this.maxTs },
      timeline: this.buildTimeline(),
      topErrors: this.topErrors(),
      anomalies: this.detectAnomalies(),
    };
  }
}

// Simple filter / search applied on an array of records.
export function filterRecords(records, q = {}) {
  const { level, files, file, logger, search, from, to, sort } = q;
  const levels = level ? new Set((Array.isArray(level) ? level : [level]).map(s => s.toUpperCase())) : null;
  // Support both `files` array (multi-select) and legacy `file` string
  const fileSet = files && files.length ? new Set(files)
    : file ? new Set([file])
    : null;
  let re = null;
  if (search) {
    try { re = new RegExp(search, 'i'); }
    catch { re = new RegExp(escapeRegex(search), 'i'); }
  }
  const out = records.filter(r => {
    if (levels && !levels.has(r.level || 'UNKNOWN')) return false;
    if (fileSet && !fileSet.has(r.file)) return false;
    if (logger && r.logger !== logger) return false;
    if (from != null && r.ts != null && r.ts < from) return false;
    if (to != null && r.ts != null && r.ts > to) return false;
    if (re && !re.test(r.message) && !re.test(r.raw || '')) return false;
    return true;
  });
  if (sort === 'time-asc' || sort === 'time-desc') {
    const dir = sort === 'time-asc' ? 1 : -1;
    out.sort((a, b) => {
      const ta = a.ts ?? Number.POSITIVE_INFINITY;
      const tb = b.ts ?? Number.POSITIVE_INFINITY;
      if (ta !== tb) return (ta - tb) * dir;
      return (a.lineNo ?? 0) - (b.lineNo ?? 0);
    });
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Heuristic root-cause hints based on cluster fingerprints.
export function rootCauseHints(clusters) {
  const hints = [];
  const seen = new Set();
  for (const c of clusters.slice(0, 10)) {
    const m = c.sample.toLowerCase();
    let hint = null;
    if (/connection (refused|timed? ?out|reset)/.test(m))
      hint = 'Network/connectivity issue — service unreachable or firewall blocking.';
    else if (/service unavailable|503/.test(m))
      hint = 'Downstream service returned 503 — check dependency health.';
    else if (/not found|404/.test(m))
      hint = 'Resource missing — verify identifiers, routing, or recent deletes.';
    else if (/unauthorized|401|forbidden|403/.test(m))
      hint = 'Auth/permission failure — token expiry, RBAC change, or wrong credentials.';
    else if (/timeout|timed out/.test(m))
      hint = 'Operation timed out — slow downstream or resource contention.';
    else if (/out of memory|oom|heap/.test(m))
      hint = 'Memory pressure — heap exhaustion, possible leak or undersized JVM/process.';
    else if (/null ?pointer|nullpointer|cannot read prop/.test(m))
      hint = 'Null/undefined access — missing data or unchecked optional.';
    else if (/deadlock|lock wait/.test(m))
      hint = 'Database/thread deadlock — review transaction order and isolation.';
    else if (/disk|no space|enospc/.test(m))
      hint = 'Disk full — clean up logs or expand volume.';
    else if (/parse|invalid json|syntax/.test(m))
      hint = 'Malformed input — schema mismatch or upstream change.';
    else if (/unique constraint|duplicate key|sqlstate.*23/.test(m))
      hint = 'Database integrity violation — duplicate insert or violated constraint.';
    if (hint && !seen.has(hint)) {
      seen.add(hint);
      hints.push({ cluster: c.fingerprint, hint });
    }
  }
  return hints;
}

export { LEVEL_RANK };
