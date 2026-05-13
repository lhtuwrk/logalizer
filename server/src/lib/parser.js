// Generic log parser with auto-detection across many formats.
// Outputs a normalized record: { ts, level, logger, thread, context, message, raw, lineNo, file }

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'WARNING', 'ERROR', 'ERR', 'FATAL', 'CRITICAL', 'CRIT', 'SEVERE', 'EMERGENCY', 'ALERT', 'PANIC'];
const LEVELS_3 = ['TRC', 'DBG', 'INF', 'WRN', 'ERR', 'FAT', 'FTL', 'CRT'];
const LEVELS_1 = ['V', 'D', 'I', 'W', 'E', 'F', 'T'];

const LEVEL_NORMALIZE = {
  WARNING: 'WARN', ERR: 'ERROR', CRIT: 'CRITICAL', SEVERE: 'ERROR',
  EMERGENCY: 'FATAL', ALERT: 'FATAL', NOTICE: 'INFO', PANIC: 'FATAL',
  TRC: 'TRACE', DBG: 'DEBUG', INF: 'INFO', WRN: 'WARN',
  FAT: 'FATAL', FTL: 'FATAL', CRT: 'CRITICAL',
  V: 'DEBUG', D: 'DEBUG', I: 'INFO', W: 'WARN', E: 'ERROR', F: 'FATAL', T: 'TRACE',
  // Syslog numeric severities (RFC 5424)
  '0': 'FATAL', '1': 'FATAL', '2': 'CRITICAL', '3': 'ERROR',
  '4': 'WARN', '5': 'INFO', '6': 'INFO', '7': 'DEBUG',
};

const LEVEL_ALT = LEVELS.join('|');
const LEVEL_ALT_3 = LEVELS_3.join('|');
const LEVEL_ALT_1 = LEVELS_1.join('|');

function normalizeLevel(lvl) {
  if (lvl === null || lvl === undefined) return null;
  const u = String(lvl).toUpperCase().trim();
  if (!u) return null;
  return LEVEL_NORMALIZE[u] || (LEVELS.includes(u) ? u : LEVEL_NORMALIZE[u] || u);
}

// Timestamp regex variants. Each capture group 1 is the timestamp text.
const TS_PATTERNS = [
  // ISO 8601
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)/,
  // 2026/02/26 07:41:25
  /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?)/,
  // syslog: Feb 26 07:41:25
  /^([A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2})/,
  // Apache common: [26/Feb/2026:07:41:25 +0000]
  /^\[(\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2}[^\]]*)\]/,
  // Rust env_logger/tracing: [TIMESTAMP LEVEL  logger]
  /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)\s+\S/,
  // Bracketed ISO: [2026-02-26 07:41:25]
  /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)\]/,
  // Unix epoch ms / seconds
  /^(\d{13})\s/,
  /^(\d{10})\s/,
  // Android Logcat: MM-DD HH:MM:SS.mmm (no year)
  /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
  // nginx error log: 2026/02/26 07:41:25 [error] ...
  /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/,
  // dd/mm/yyyy hh:mm:ss
  /^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?)/,
  // dd-mm-yyyy hh:mm:ss
  /^(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?)/,
];

const BRACKETED_LEVEL = new RegExp(`\\[(${LEVEL_ALT}|${LEVEL_ALT_3}|${LEVEL_ALT_1})\\]`, 'i');
const SPACED_LEVEL = new RegExp(`(?<=^|\\s|-\\s)(${LEVEL_ALT}|${LEVEL_ALT_3})(?=[\\s:]|$)`);
const LOGCAT_LEVEL = new RegExp(`(?<=^\\s*\\d+\\s+\\d+\\s)(${LEVEL_ALT_1})(?=\\s+\\S)`);
const DASH_LEVEL_1 = new RegExp(`(?<=-\\s)(${LEVEL_ALT_1})(?=\\s+-|\\s+\\[)`);

function tsToMs(s) {
  if (!s) return null;
  if (/^\d{13}$/.test(s)) return Number(s);
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  // Apache: 26/Feb/2026:07:41:25 +0000
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
  // Logcat MM-DD HH:MM:SS.mmm
  const logcat = s.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (logcat) {
    const [, mo, dd, hh, mm, ss, frac] = logcat;
    const year = new Date().getFullYear();
    const ms = frac ? Math.round(Number(frac.slice(0, 3).padEnd(3, '0'))) : 0;
    return Date.UTC(year, +mo - 1, +dd, +hh, +mm, +ss, ms);
  }
  // Syslog Feb 26 07:41:25
  const syslog = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (syslog) {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const [, mon, dd, hh, mm, ss] = syslog;
    const year = new Date().getFullYear();
    return Date.UTC(year, months[mon] || 0, +dd, +hh, +mm, +ss);
  }
  // dd/mm/yyyy hh:mm:ss or dd-mm-yyyy hh:mm:ss
  const euro = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?$/);
  if (euro) {
    const [, dd, mo, yyyy, hh, mm, ss, frac] = euro;
    const ms = frac ? Math.round(Number(frac.slice(0, 3).padEnd(3, '0'))) : 0;
    return Date.UTC(+yyyy, +mo - 1, +dd, +hh, +mm, +ss, ms);
  }
  // 2026/02/26 07:41:25
  const slash = s.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?$/);
  if (slash) {
    const [, yyyy, mo, dd, hh, mm, ss, frac] = slash;
    const ms = frac ? Math.round(Number(frac.slice(0, 3).padEnd(3, '0'))) : 0;
    return Date.UTC(+yyyy, +mo - 1, +dd, +hh, +mm, +ss, ms);
  }
  // ISO fallback. Treat naive timestamps (no TZ) as UTC.
  let iso = s.replace(/,(\d+)/, '.$1').replace(' ', 'T');
  if (!/Z|[+\-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

// Build a normalized record.
function rec(line, lineNo, file, fields = {}) {
  return {
    ts: fields.ts ?? null,
    level: fields.level ? normalizeLevel(fields.level) : null,
    logger: fields.logger ?? null,
    thread: fields.thread ?? null,
    context: fields.context ?? null,
    message: fields.message ?? line,
    raw: line,
    lineNo,
    file,
    meta: fields.meta,
  };
}

// =============================================================================
// Format-specific matchers. Each returns a record or null.
// Order matters — most specific first.
// =============================================================================

// Rust env_logger / tracing-subscriber: [2026-05-06T08:01:36Z INFO  db_bridge] msg
const RE_RUST = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)\s+([A-Z]+)\s+([\w:.\-]+)\]\s*([\s\S]*)/;

// Go default log: 2026/02/26 07:41:25 message  OR  2026/02/26 07:41:25.123456 message
const RE_GO = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(.*)$/;

// nginx error log: 2026/02/26 07:41:25 [error] 1234#0: *5 message
const RE_NGINX_ERROR = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(\d+)#(\d+):\s*(?:\*\d+\s+)?([\s\S]*)/;

// nginx/Apache access (Combined Log Format):
// 1.2.3.4 - user [26/Feb/2026:07:41:25 +0000] "GET /path HTTP/1.1" 200 1234 "ref" "ua"
const RE_ACCESS = /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\d+|-)(?:\s+"([^"]*)"\s+"([^"]*)")?/;

// Syslog RFC 5424: <34>1 2026-02-26T07:41:25Z host app procid msgid [sd] message
const RE_SYSLOG_5424 = /^<(\d+)>1\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:\[[^\]]*\]\s+|-\s+)?([\s\S]*)/;

// Syslog RFC 3164: Feb 26 07:41:25 hostname program[pid]: message
const RE_SYSLOG_3164 = /^([A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\[:\s]+)(?:\[(\d+)\])?:\s*([\s\S]*)/;

// Kubernetes klog: I0226 07:41:25.123456   1234 file.go:42] message
const RE_KLOG = /^([IWEF])(\d{2})(\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+([^\]]+)\]\s*([\s\S]*)/;
const KLOG_LEVEL = { I: 'INFO', W: 'WARN', E: 'ERROR', F: 'FATAL' };

// Docker JSON-File log (one JSON per line with {"log":"...","stream":"...","time":"..."})
// Handled in parseJsonLine via field aliases.

// Java/log4j common: 2026-02-26 07:41:25,123 [thread] LEVEL logger.name - message
// Also: 2026-02-26 07:41:25.123 LEVEL [thread] logger.name - message
const RE_LOG4J_A = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)\s+\[([^\]]+)\]\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRC|DBG|INF|WRN|ERR|FAT)\s+([\w$.:\-]+)\s+-\s+([\s\S]*)/i;
const RE_LOG4J_B = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+\-]\d{2}:?\d{2})?)\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+\[([^\]]+)\]\s+([\w$.:\-]+)\s*[-:]\s*([\s\S]*)/i;
// Logback/Spring Boot: 2026-02-26 07:41:25.123  INFO 1234 --- [thread] logger : message
const RE_SPRING = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]\d+)\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+(\d+)\s+---\s+\[([^\]]+)\]\s+([\w$.:\-]+)\s*:\s*([\s\S]*)/i;

// Python logging default: 2026-02-26 07:41:25,123 - logger - LEVEL - message
const RE_PYTHON_A = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+-\s+([\w$.:\-]+)\s+-\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\s+-\s+([\s\S]*)/i;
// Python logging alt: 2026-02-26 07:41:25,123 LEVEL logger: message
const RE_PYTHON_B = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\s+([\w$.:\-]+):\s*([\s\S]*)/i;

// Android Logcat brief: MM-DD HH:MM:SS.mmm  PID  TID L Tag: msg
const RE_LOGCAT = /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEFT])\s+([^:]+):\s*([\s\S]*)/;

// CEF: CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
const RE_CEF = /^CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/;

// LEEF: LEEF:Version|Vendor|Product|Version|EventID|Delimiter|Extension
const RE_LEEF = /^LEEF:(\d+(?:\.\d+)?)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([^|]))?\|(.*)$/;

// GELF chunked (JSON) handled by JSON parser. Plain GELF text: covered by other matchers.

// systemd journal short: Feb 26 07:41:25 host unit[pid]: message — same as syslog 3164.

// AWS CloudWatch: 2026-02-26T07:41:25.123Z msg... — covered by ISO + plain.

// Heroku router: 2026-02-26T07:41:25.123456+00:00 app[web.1]: message
const RE_HEROKU = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2}))\s+(\S+)\[([^\]]+)\]:\s*([\s\S]*)/;

// Windows Event Log textual export: "Information  2/26/2026 7:41:25 AM  Source  EventID  Task  message"
const RE_WIN_EVENT = /^(Information|Warning|Error|Critical|Verbose)\s+(\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}(?:\s+[AP]M)?)\s+(\S+)\s+(\d+)\s+(\S+)\s+([\s\S]*)/i;

// IIS W3C log fields (header line "#Fields:"). Handled when present.
// Data row example: 2026-02-26 07:41:25 W3SVC1 ... — captured by generic plain matcher.

// Postgres log: 2026-02-26 07:41:25.123 UTC [1234] LOG: message
const RE_POSTGRES = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:[.,]\d+)?\s+\S+)\s+\[(\d+)\](?:-\d+)?\s+(LOG|WARNING|ERROR|FATAL|PANIC|DEBUG\d?|INFO|NOTICE|STATEMENT|HINT|DETAIL|CONTEXT):\s*([\s\S]*)/;

// MySQL error log: 2026-02-26T07:41:25.123456Z 0 [Note] [MY-010116] [Server] message
const RE_MYSQL = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2}))\s+(\d+)\s+\[(Note|Warning|ERROR|System|Info)\](?:\s+\[([^\]]+)\])?(?:\s+\[([^\]]+)\])?\s*([\s\S]*)/;
const MYSQL_LEVEL = { Note: 'INFO', Warning: 'WARN', ERROR: 'ERROR', System: 'INFO', Info: 'INFO' };

// Generic bracketed ISO with embedded level: [2026-02-26 07:41:25] [INFO] message
const RE_BRACKET_ISO = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+\-]\d{2}:?\d{2})?)\]\s*\[(\w+)\]\s*([\s\S]*)/;

function tryMatchers(line, lineNo, file) {
  let m;

  if ((m = RE_RUST.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), level: m[2], logger: m[3], message: m[4] });
  }
  if ((m = RE_SPRING.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), level: m[2], thread: m[4], logger: m[5], context: m[3], message: m[6] });
  }
  if ((m = RE_LOG4J_A.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), thread: m[2], level: m[3], logger: m[4], message: m[5] });
  }
  if ((m = RE_LOG4J_B.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), level: m[2], thread: m[3], logger: m[4], message: m[5] });
  }
  if ((m = RE_PYTHON_A.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), logger: m[2], level: m[3], message: m[4] });
  }
  if ((m = RE_PYTHON_B.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), level: m[2], logger: m[3], message: m[4] });
  }
  if ((m = RE_POSTGRES.exec(line))) {
    const lvl = /^DEBUG/i.test(m[3]) ? 'DEBUG' : (m[3] === 'LOG' ? 'INFO' : m[3]);
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), context: m[2], level: lvl, message: m[4], logger: 'postgres' });
  }
  if ((m = RE_MYSQL.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), context: m[2], level: MYSQL_LEVEL[m[3]] || m[3], logger: m[4] || m[5] || 'mysql', message: m[6] });
  }
  if ((m = RE_NGINX_ERROR.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), level: m[2], thread: m[3], context: m[4], logger: 'nginx', message: m[5] });
  }
  if ((m = RE_HEROKU.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), logger: m[2], context: m[3], message: m[4] });
  }
  if ((m = RE_KLOG.exec(line))) {
    const year = new Date().getFullYear();
    const [, lvlChar, mo, dd, time, pid, loc, msg] = m;
    const ts = tsToMs(`${year}-${mo}-${dd}T${time}`);
    return rec(line, lineNo, file, { ts, level: KLOG_LEVEL[lvlChar] || lvlChar, thread: pid, logger: loc.trim(), message: msg });
  }
  if ((m = RE_LOGCAT.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), thread: `${m[2]}/${m[3]}`, level: m[4], logger: m[5].trim(), message: m[6] });
  }
  if ((m = RE_CEF.exec(line))) {
    return rec(line, lineNo, file, { level: severityToLevel(m[7]), logger: `${m[2]}/${m[3]}`, context: m[5], message: m[6] + (m[8] ? ' | ' + m[8] : '') });
  }
  if ((m = RE_LEEF.exec(line))) {
    return rec(line, lineNo, file, { logger: `${m[2]}/${m[3]}`, context: m[5], message: m[7] });
  }
  if ((m = RE_WIN_EVENT.exec(line))) {
    return rec(line, lineNo, file, { level: m[1], ts: tsToMs(m[2]), logger: m[3], context: m[4], message: m[6] });
  }
  if ((m = RE_SYSLOG_5424.exec(line))) {
    const pri = parseInt(m[1], 10);
    const severity = pri & 7;
    return rec(line, lineNo, file, { level: String(severity), ts: tsToMs(m[2]), logger: m[4], thread: m[5], context: m[6], message: m[7] });
  }
  if ((m = RE_SYSLOG_3164.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), logger: m[3], thread: m[4], context: m[2], message: m[5] });
  }
  if ((m = RE_ACCESS.exec(line))) {
    const status = parseInt(m[6], 10);
    const lvl = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    return rec(line, lineNo, file, { ts: tsToMs(m[4]), level: lvl, logger: 'http', context: m[1], message: `${m[5]} -> ${m[6]} (${m[7]} bytes)${m[8] ? ' ref=' + m[8] : ''}${m[9] ? ' ua=' + m[9] : ''}` });
  }
  if ((m = RE_BRACKET_ISO.exec(line))) {
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), level: m[2], message: m[3] });
  }
  if ((m = RE_GO.exec(line))) {
    // Apply only if no other pattern matched and the timestamp looks Go-style at line start.
    return rec(line, lineNo, file, { ts: tsToMs(m[1]), message: m[2] });
  }
  return null;
}

function severityToLevel(s) {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return s;
  if (n >= 9) return 'CRITICAL';
  if (n >= 7) return 'ERROR';
  if (n >= 4) return 'WARN';
  return 'INFO';
}

// =============================================================================
// JSON / logfmt
// =============================================================================

function parseJsonLine(line, lineNo, file) {
  try {
    const o = JSON.parse(line);
    // Docker JSON-File: { log, stream, time }
    if (o.log !== undefined && o.time !== undefined && o.stream !== undefined) {
      const inner = String(o.log).replace(/\n$/, '');
      // Try to further parse the inner log line.
      const sub = tryMatchers(inner, lineNo, file);
      if (sub) { sub.ts = sub.ts || tsToMs(String(o.time)); sub.raw = line; return sub; }
      return rec(line, lineNo, file, {
        ts: tsToMs(String(o.time)),
        level: o.stream === 'stderr' ? 'ERROR' : 'INFO',
        logger: 'docker',
        message: inner,
        meta: o,
      });
    }
    const ts = o.timestamp || o.time || o['@timestamp'] || o.ts || o.date || o.eventTime;
    return {
      ts: ts ? tsToMs(String(ts)) : null,
      level: normalizeLevel(o.level || o.severity || o.lvl || o.levelname || o.log_level),
      logger: o.logger || o.module || o.name || o.component || o.source || null,
      thread: o.thread || o.threadName || o.thread_name || null,
      context: o.context || o.requestId || o.request_id || o.traceId || o.trace_id || o.span || o.spanId || null,
      message: o.message || o.msg || o.text || o.log || JSON.stringify(o),
      raw: line,
      lineNo,
      file,
      meta: o,
    };
  } catch {
    return rec(line, lineNo, file, { message: line });
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
    logger: out.logger || out.component || out.source || null,
    thread: out.thread || null,
    context: out.requestId || out.request_id || out.trace || out.traceId || out.context || null,
    message: out.msg || out.message || line,
    raw: line,
    lineNo,
    file,
    meta: out,
  };
}

// =============================================================================
// Generic plain fallback: timestamp + heuristic level + bracket extraction.
// =============================================================================

function parsePlainLine(line, lineNo, file) {
  const matched = tryMatchers(line, lineNo, file);
  if (matched) return matched;

  let ts = null, tsText = null;
  for (const re of TS_PATTERNS) {
    const m = line.match(re);
    if (m) { tsText = m[1]; ts = tsToMs(m[1]); break; }
  }
  const tsEnd = tsText ? line.indexOf(tsText) + tsText.length : 0;
  const head = line.slice(tsEnd, tsEnd + 120);
  const bracketed = head.match(BRACKETED_LEVEL);
  const spaced = bracketed ? null : head.match(SPACED_LEVEL);
  const logcat = !bracketed && !spaced ? head.match(LOGCAT_LEVEL) : null;
  const dashed = !bracketed && !spaced && !logcat ? head.match(DASH_LEVEL_1) : null;
  const lvlMatch = bracketed || spaced || logcat || dashed;
  const level = lvlMatch ? normalizeLevel(lvlMatch[1]) : null;

  let logger = null, thread = null, context = null, message = line;
  let rest = tsText ? line.slice(line.indexOf(tsText) + tsText.length).replace(/^[\]\s]*/, '') : line;
  if (lvlMatch) rest = rest.replace(lvlMatch[0], '').replace(/^\s+/, '');
  if (logcat) {
    rest = rest.replace(/^\d+\s+\d+\s*/, '');
    const tagM = rest.match(/^([A-Za-z0-9_.\-/]+)\s*:\s*/);
    if (tagM) { logger = tagM[1]; rest = rest.slice(tagM[0].length); }
  }
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

// =============================================================================
// Format detection
// =============================================================================

export function detectFormat(samples) {
  let json = 0, kv = 0, tsCount = 0, total = 0;
  for (const line of samples) {
    if (!line.trim()) continue;
    total++;
    if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
      try { JSON.parse(line); json++; continue; } catch {}
    }
    const hasTs = TS_PATTERNS.some(re => re.test(line));
    if (hasTs) tsCount++;
    const kvMatches = line.match(/\b\w+=("[^"]*"|\S+)/g);
    if (kvMatches && kvMatches.length >= 2 && !hasTs) kv++;
  }
  if (total === 0) return 'plain';
  if (json / total > 0.6) return 'json';
  if (tsCount / total > 0.4) return 'plain';
  if (kv / total > 0.5) return 'logfmt';
  return 'plain';
}

function parseLine(line, format, lineNo, file) {
  if (format === 'json') return parseJsonLine(line, lineNo, file);
  if (format === 'logfmt') return parseLogfmtLine(line, lineNo, file);
  return parsePlainLine(line, lineNo, file);
}

// Continuation detection: a line is a continuation if it has no recognizable
// log-line opening (no timestamp, no known format prefix like CEF/LEEF/klog).
function isContinuation(line, format) {
  if (!line) return false;
  if (format === 'json') return false;
  if (TS_PATTERNS.some(re => re.test(line))) return false;
  if (RE_CEF.test(line) || RE_LEEF.test(line)) return false;
  if (RE_KLOG.test(line)) return false;
  if (RE_WIN_EVENT.test(line)) return false;
  if (RE_SYSLOG_5424.test(line)) return false;
  return true;
}

// =============================================================================
// Streaming parser
// =============================================================================

export async function* parseStream(lineIter, opts = {}) {
  const { file = null, customParser = null } = opts;
  let format = opts.format || null;
  const SAMPLE_SIZE = 25;
  let sample = [];
  let sampleNos = [];
  let last = null;
  let lineNo = 0;

  // If a custom parser is supplied, use it for every line. Lines that the
  // custom parser doesn't match are treated as continuations of the previous
  // record (or a raw record if there's no previous one).
  if (customParser) {
    for await (const line of lineIter) {
      lineNo++;
      const parsed = customParser(line, lineNo, file);
      if (parsed) {
        if (last) yield last;
        last = parsed;
      } else if (last) {
        last.message += '\n' + line;
        last.raw += '\n' + line;
      } else {
        last = { ts: null, level: null, logger: null, thread: null, context: null,
                 message: line, raw: line, lineNo, file };
      }
    }
    if (last) yield last;
    return;
  }

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
