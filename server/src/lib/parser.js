// Generic log parser with auto-detection.
// Outputs a normalized record: { ts, level, logger, thread, context, message, raw, lineNo, file }

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'WARNING', 'ERROR', 'ERR', 'FATAL', 'CRITICAL', 'CRIT', 'SEVERE', 'EMERGENCY', 'ALERT'];
// 3-char abbreviations common in some frameworks
const LEVELS_3 = ['TRC', 'DBG', 'INF', 'WRN', 'ERR', 'FAT', 'FTL', 'CRT'];
// Single-char abbreviations used in Android Logcat and some compact formats (V=Verbose/Debug)
const LEVELS_1 = ['V', 'D', 'I', 'W', 'E', 'F', 'T'];

const LEVEL_NORMALIZE = {
  WARNING: 'WARN', ERR: 'ERROR', CRIT: 'CRITICAL', SEVERE: 'ERROR',
  EMERGENCY: 'FATAL', ALERT: 'FATAL', NOTICE: 'INFO',
  // 3-char
  TRC: 'TRACE', DBG: 'DEBUG', INF: 'INFO', WRN: 'WARN',
  FAT: 'FATAL', FTL: 'FATAL', CRT: 'CRITICAL',
  // single-char
  V: 'DEBUG', D: 'DEBUG', I: 'INFO', W: 'WARN', E: 'ERROR', F: 'FATAL', T: 'TRACE',
};

// Timestamp regex variants. Each capture group 1 is the timestamp text.
const TS_PATTERNS = [
  // ISO 8601: 2026-02-26T07:41:25.259Z, 2026-02-26 07:41:25,259, 2026-02-26 07:41:25.259+02:00
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)/,
  // 2026/02/26 07:41:25
  /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?)/,
  // syslog: Feb 26 07:41:25
  /^([A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2})/,
  // Apache common log: [26/Feb/2026:07:41:25 +0000]
  /^\[(\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2}[^\]]*)\]/,
  // Bracketed ISO: [2026-02-26 07:41:25]
  /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)\]/,
  // Unix epoch milliseconds at line start
  /^(\d{13})\s/,
  // Unix epoch seconds
  /^(\d{10})\s/,
  // Android Logcat: MM-DD HH:MM:SS.mmm (no year)
  /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
];

// Strict level detection: a level must appear in a "level slot" — bracketed
// ([INFO], [error], [E], [WRN]), or as a delimited UPPERCASE token surrounded
// by space/colon. Single-char levels are ONLY matched inside brackets or in
// the logcat PID/TID slot — never as bare letters — to avoid false positives.
const LEVEL_ALT = LEVELS.join('|');
const LEVEL_ALT_3 = LEVELS_3.join('|');
const LEVEL_ALT_1 = LEVELS_1.join('|');

// Bracketed: [INFO] / [error] / [WRN] / [E] / [w] (case-insensitive for all)
const BRACKETED_LEVEL = new RegExp(
  `\\[(${LEVEL_ALT}|${LEVEL_ALT_3}|${LEVEL_ALT_1})\\]`, 'i'
);

// Use lookbehind so match[0] is exactly the level word (no leading whitespace),
// which keeps the message-extraction strip step simple.
// Full-name + 3-char: case-sensitive UPPERCASE only, surrounded by whitespace/colon/dash
const SPACED_LEVEL = new RegExp(
  `(?<=^|\\s|-\\s)(${LEVEL_ALT}|${LEVEL_ALT_3})(?=[\\s:]|$)`
);

// Android Logcat: <date> <time> <pid> <tid> <SINGLE_CHAR> <TAG>: message
// e.g. "02-26 07:41:25.259 1234 5678 E TAG: msg"
// head starts AFTER the timestamp, so it contains "  <pid> <tid> <LEVEL_CHAR> <TAG>..."
// Lookbehind: optional leading space + pid + space + tid + space before level char.
const LOGCAT_LEVEL = new RegExp(
  `(?<=^\\s*\\d+\\s+\\d+\\s)(${LEVEL_ALT_1})(?=\\s+\\S)`
);

// Dash-separated single-char level: "... - D - ..." or "... - D ["
// Matches formats like: correlationId - D - [logger] message
// Safe because the single char must be surrounded by " - " on at least one side.
const DASH_LEVEL_1 = new RegExp(
  `(?<=-\\s)(${LEVEL_ALT_1})(?=\\s+-|\\s+\\[)`
);

function normalizeLevel(lvl) {
  if (!lvl) return null;
  const u = lvl.toUpperCase();
  return LEVEL_NORMALIZE[u] || u;
}

function tsToMs(s) {
  if (!s) return null;
  if (/^\d{13}$/.test(s)) return Number(s);
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  // Apache style: 26/Feb/2026:07:41:25 +0000
  const apache = s.match(/^(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+\-]\d{4})?$/);
  if (apache) {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const [, dd, mon, yyyy, hh, mm, ss, tz] = apache;
    const d = new Date(Date.UTC(+yyyy, months[mon] || 0, +dd, +hh, +mm, +ss));
    if (tz) {
      const sign = tz[0] === '-' ? 1 : -1;
      const offMin = sign * (parseInt(tz.slice(1, 3)) * 60 + parseInt(tz.slice(3, 5)));
      d.setUTCMinutes(d.getUTCMinutes() + offMin);
    }
    return d.getTime();
  }
  // Logcat MM-DD HH:MM:SS.mmm (no year) -> assume current year
  const logcat = s.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (logcat) {
    const [, mo, dd, hh, mm, ss, frac] = logcat;
    const year = new Date().getFullYear();
    const ms = frac ? Math.round(Number(frac.slice(0, 3).padEnd(3, '0'))) : 0;
    return Date.UTC(year, +mo - 1, +dd, +hh, +mm, +ss, ms);
  }
  // syslog without year: Feb 26 07:41:25 -> assume current year
  const syslog = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (syslog) {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const [, mon, dd, hh, mm, ss] = syslog;
    const year = new Date().getFullYear();
    return Date.UTC(year, months[mon] || 0, +dd, +hh, +mm, +ss);
  }
  // Replace comma decimal with dot for ISO; treat naive timestamps (no TZ) as UTC
  // so the displayed value matches what was printed in the log.
  let iso = s.replace(/,(\d+)/, '.$1').replace(' ', 'T');
  if (!/Z|[+\-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// Detect format from first non-empty samples.
export function detectFormat(samples) {
  let json = 0, kv = 0, tsCount = 0, total = 0;
  for (const line of samples) {
    if (!line.trim()) continue;
    total++;
    if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
      try { JSON.parse(line); json++; continue; } catch {}
    }
    if (TS_PATTERNS.some(re => re.test(line))) tsCount++;
    // logfmt: key=value pairs
    const kvMatches = line.match(/\b\w+=("[^"]*"|\S+)/g);
    if (kvMatches && kvMatches.length >= 2 && !TS_PATTERNS.some(re => re.test(line))) kv++;
  }
  if (total === 0) return 'plain';
  if (json / total > 0.6) return 'json';
  if (tsCount / total > 0.4) return 'plain';
  if (kv / total > 0.5) return 'logfmt';
  return 'plain';
}

function parseJsonLine(line, lineNo, file) {
  try {
    const o = JSON.parse(line);
    const ts = o.timestamp || o.time || o['@timestamp'] || o.ts || o.date;
    return {
      ts: ts ? tsToMs(String(ts)) : null,
      level: normalizeLevel(o.level || o.severity || o.lvl),
      logger: o.logger || o.module || o.name || o.component || null,
      thread: o.thread || o.threadName || null,
      context: o.context || o.requestId || o.traceId || o.span || null,
      message: o.message || o.msg || o.text || JSON.stringify(o),
      raw: line,
      lineNo,
      file,
      meta: o,
    };
  } catch {
    return { ts: null, level: null, logger: null, thread: null, context: null, message: line, raw: line, lineNo, file };
  }
}

function parseLogfmtLine(line, lineNo, file) {
  const out = {};
  const re = /(\w+)=("([^"]*)"|(\S+))/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out[m[1]] = m[3] !== undefined ? m[3] : m[4];
  }
  const ts = out.time || out.ts || out.timestamp;
  return {
    ts: ts ? tsToMs(ts) : null,
    level: normalizeLevel(out.level || out.lvl || out.severity),
    logger: out.logger || out.component || null,
    thread: out.thread || null,
    context: out.requestId || out.trace || out.context || null,
    message: out.msg || out.message || line,
    raw: line,
    lineNo,
    file,
    meta: out,
  };
}

function parsePlainLine(line, lineNo, file) {
  let ts = null, tsText = null;
  for (const re of TS_PATTERNS) {
    const m = line.match(re);
    if (m) { tsText = m[1]; ts = tsToMs(m[1]); break; }
  }
  // Search for level only in the leading portion of the line (after timestamp)
  // to avoid false positives like "error" appearing in prose or URLs.
  const tsEnd = tsText ? line.indexOf(tsText) + tsText.length : 0;
  const head = line.slice(tsEnd, tsEnd + 120);
  // Priority: bracketed > spaced full/3-char > logcat pid/tid > dash-single-char
  const bracketed = head.match(BRACKETED_LEVEL);
  const spaced = bracketed ? null : head.match(SPACED_LEVEL);
  const logcat = !bracketed && !spaced ? head.match(LOGCAT_LEVEL) : null;
  const dashed = !bracketed && !spaced && !logcat ? head.match(DASH_LEVEL_1) : null;
  const lvlMatch = bracketed || spaced || logcat || dashed;
  const level = lvlMatch ? normalizeLevel(lvlMatch[1]) : null;
  // Try to extract logger from [com.foo.Bar] style after level
  let logger = null, thread = null, context = null, message = line;
  // Trim ts from start if found
  let rest = tsText ? line.slice(line.indexOf(tsText) + tsText.length).replace(/^[\]\s]*/, '') : line;
  if (lvlMatch) rest = rest.replace(lvlMatch[0], '').replace(/^\s+/, '');
  // Logcat TAG: strip PID/TID numbers before the level char, then extract "TAG:" logger
  if (logcat) {
    rest = rest.replace(/^\d+\s+\d+\s*/, ''); // strip pid tid
    const tagM = rest.match(/^([A-Za-z0-9_.\-/]+)\s*:\s*/);
    if (tagM) { logger = tagM[1]; rest = rest.slice(tagM[0].length); }
  }
  // Extract bracketed segments greedily: [logger] [context] (thread) message
  const brackets = [];
  let cursor = 0;
  while (cursor < rest.length) {
    const c = rest[cursor];
    if (c === '[') {
      const end = rest.indexOf(']', cursor + 1);
      if (end < 0) break;
      brackets.push(rest.slice(cursor + 1, end));
      cursor = end + 1;
      while (cursor < rest.length && rest[cursor] === ' ') cursor++;
    } else if (c === '(') {
      const end = rest.indexOf(')', cursor + 1);
      if (end < 0) break;
      thread = rest.slice(cursor + 1, end);
      cursor = end + 1;
      while (cursor < rest.length && rest[cursor] === ' ') cursor++;
    } else break;
  }
  if (brackets[0]) logger = brackets[0];
  if (brackets[1]) context = brackets[1];
  message = rest.slice(cursor).trim() || rest.trim();
  if (!message) message = line;
  return { ts, level, logger, thread, context, message, raw: line, lineNo, file };
}

function parseLine(line, format, lineNo, file) {
  if (format === 'json') return parseJsonLine(line, lineNo, file);
  if (format === 'logfmt') return parseLogfmtLine(line, lineNo, file);
  return parsePlainLine(line, lineNo, file);
}

// Decide if a line is a continuation of the previous entry.
// Rule of thumb: if a line has no recognizable timestamp at its start, it almost
// always belongs to the previous record (stack frames, exception messages,
// printed multi-line payloads, help URLs after errors, etc.).
function isContinuation(line, format) {
  if (!line) return false;          // empty lines: drop (caller decides)
  if (format === 'json') return false;
  if (TS_PATTERNS.some(re => re.test(line))) return false;
  return true;
}

// Streaming parse: takes async iterable of lines, yields normalized records.
// Joins continuation lines (multiline stack traces) into the previous record's message.
export async function* parseStream(lineIter, opts = {}) {
  const { file = null } = opts;
  let format = opts.format || null;
  const SAMPLE_SIZE = 25;
  let sample = [];        // collected lines while detecting format
  let sampleNos = [];
  let last = null;
  let lineNo = 0;

  function pushLine(line, ln) {
    if (last && isContinuation(line, format)) {
      last.message += '\n' + line;
      last.raw += '\n' + line;
      return null;
    }
    const out = last;
    last = parseLine(line, format, ln, file);
    return out;
  }

  for await (const line of lineIter) {
    lineNo++;
    if (!format) {
      sample.push(line);
      sampleNos.push(lineNo);
      const nonEmpty = sample.filter(l => l.trim()).length;
      if (nonEmpty >= SAMPLE_SIZE) {
        format = detectFormat(sample);
        for (let i = 0; i < sample.length; i++) {
          const result = pushLine(sample[i], sampleNos[i]);
          if (result) yield result;
        }
        sample = null;
        sampleNos = null;
      }
      continue;
    }
    const result = pushLine(line, lineNo);
    if (result) yield result;
  }

  // Stream ended before reaching sample size
  if (!format && sample) {
    format = detectFormat(sample);
    for (let i = 0; i < sample.length; i++) {
      const result = pushLine(sample[i], sampleNos[i]);
      if (result) yield result;
    }
  }
  if (last) yield last;
}

export { LEVELS, normalizeLevel, tsToMs };
