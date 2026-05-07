// Quick checks for level-detection accuracy.
// Run: node server/test_parser.js
import { parseStream } from './src/lib/parser.js';

async function* lines(text) {
  for (const l of text.split('\n')) yield l;
}

async function lvl(line) {
  const out = [];
  for await (const r of parseStream(lines(line))) out.push(r);
  return out[0];
}

const cases = [
  // [line, expectedLevel, why]
  ['2026-02-26 07:41:25,259 INFO  [com.foo.Bar] msg', 'INFO', 'standard quarkus'],
  ['2026-02-26 07:41:25,259 ERROR [com.foo.Bar] msg', 'ERROR', 'standard quarkus error'],
  ['2026-02-26 07:41:25 WARN  Some message', 'WARN', 'simple WARN'],

  // Negative: prose containing the word "error" should NOT be tagged ERROR
  ['2026-02-26 07:41:25 Some error happened in service', null, 'lowercase prose "error"'],
  ['2026-02-26 07:41:25 An info note about config', null, 'lowercase prose "info"'],
  ['2026-02-26 07:41:25 Warning was logged earlier', null, 'lowercase prose "warning"'],
  ['2026-02-26 07:41:25 [com.foo.WarnService] msg', null, 'level word as part of class name'],
  ['2026-02-26 07:41:25 INFO [com.foo.WarnService] message', 'INFO', 'class with level word - first match wins'],

  // Apache / nginx lowercase bracketed
  ['[Thu Feb 26 07:41:25 2026] [error] [client 1.2.3.4] file does not exist', 'ERROR', 'apache lowercase [error]'],
  ['2026/02/26 07:41:25 [info] 1234#0: client connected', 'INFO', 'nginx lowercase [info]'],

  // Python logging
  ['2026-02-26 12:00:00,123 - my_logger - ERROR - message', 'ERROR', 'python logging dashed'],

  // Mixed
  ['2026-02-26 12:00:00 INFO  WARN: deprecated method called', 'INFO', 'first wins (INFO before WARN)'],

  // No timestamp
  ['ERROR: something broke', 'ERROR', 'level at start of line'],
  ['INFO: starting server', 'INFO', 'INFO: variant'],

  // Edge: URL containing "error"
  ['2026-02-26 07:41:25 ERROR see https://docs.com/error-help/', 'ERROR', 'real ERROR + url has "error" word'],
  ['2026-02-26 07:41:25 see https://docs.com/error-help/', null, 'just url with "error" - no real level'],

  // 3-char abbreviations (bracketed)
  ['2026-02-26 07:41:25 [WRN] connection pool exhausted', 'WARN', '3-char [WRN] bracketed'],
  ['2026-02-26 07:41:25 [INF] server started', 'INFO', '3-char [INF] bracketed'],
  ['2026-02-26 07:41:25 [ERR] failed to connect', 'ERROR', '3-char [ERR] bracketed'],
  ['2026-02-26 07:41:25 [DBG] entering function', 'DEBUG', '3-char [DBG] bracketed'],
  ['2026-02-26 07:41:25 [TRC] trace output', 'TRACE', '3-char [TRC] bracketed'],
  ['2026-02-26 07:41:25 [FTL] fatal crash', 'FATAL', '3-char [FTL] bracketed'],
  ['2026-02-26 07:41:25 [CRT] critical failure', 'CRITICAL', '3-char [CRT] bracketed'],

  // 3-char spaced UPPERCASE
  ['2026-02-26 07:41:25 WRN timeout exceeded', 'WARN', '3-char WRN spaced'],
  ['2026-02-26 07:41:25 INF service ready', 'INFO', '3-char INF spaced'],

  // Single-char bracketed
  ['2026-02-26 07:41:25 [E] disk full', 'ERROR', 'single-char [E] bracketed'],
  ['2026-02-26 07:41:25 [W] low memory', 'WARN', 'single-char [W] bracketed'],
  ['2026-02-26 07:41:25 [I] started', 'INFO', 'single-char [I] bracketed'],
  ['2026-02-26 07:41:25 [D] debug msg', 'DEBUG', 'single-char [D] bracketed'],
  ['2026-02-26 07:41:25 [F] fatal error', 'FATAL', 'single-char [F] bracketed'],

  // Android Logcat format: date time pid tid LEVEL TAG: message
  ['02-26 07:41:25.259 1234 5678 E MyTag: something broke', 'ERROR', 'logcat single E'],
  ['02-26 07:41:25.259 1234 5678 W NetworkManager: retrying', 'WARN', 'logcat single W'],
  ['02-26 07:41:25.259 1234 5678 I Activity: onCreate', 'INFO', 'logcat single I'],
  ['02-26 07:41:25.259 1234 5678 D HttpClient: sending request', 'DEBUG', 'logcat single D'],
  ['02-26 07:41:25.259 1234 5678 V ViewRootImpl: draw frame', 'DEBUG', 'logcat verbose V->DEBUG'],

  // Negative: single-char level should NOT match in prose
  ['2026-02-26 07:41:25 I went to the store', null, 'single I in prose - no match'],
  ['2026-02-26 07:41:25 The E street band played', null, 'single E in prose - no match'],

  // Dash-separated single-char: "correlationId - D - [logger] message"
  ['2026-03-11 16:59:26.125 20260313-New-ACPT-ch-... - D - [com.foo.Bar] msg', 'DEBUG', 'dash-sep single D'],
  ['2026-03-11 16:59:26.125 20260313-New-ACPT-ch-... - E - [com.foo.Bar] msg', 'ERROR', 'dash-sep single E'],
  ['2026-03-11 16:59:26.125 20260313-New-ACPT-ch-... - W - [com.foo.Bar] msg', 'WARN',  'dash-sep single W'],
  ['2026-03-11 16:59:26.125 20260313-New-ACPT-ch-... - I - [com.foo.Bar] msg', 'INFO',  'dash-sep single I'],
  // Negative: single char after dash but NOT followed by " -" or " ["
  ['2026-03-11 16:59:26.125 some-E-value should not match', null, 'single E in identifier - no match'],
];

let passed = 0, failed = 0;
for (const [line, expected, why] of cases) {
  const r = await lvl(line);
  const got = r?.level ?? null;
  const ok = got === expected;
  ok ? passed++ : failed++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`${tag}  expected=${expected ?? 'null'}  got=${got ?? 'null'}  | ${why}`);
  if (!ok) console.log(`       line: ${line}`);
}

// Message-extraction sanity: the parsed message should not contain the level
// prefix or the [logger] prefix.
console.log('\n-- message extraction --');
const msgCases = [
  '2026-02-26 07:41:25,259 INFO  [com.foo.Bar] Hello world',
  '2026-02-26 07:41:25,259 ERROR [com.foo.Bar] (thread-1) Boom',
  '2026-02-26 07:41:25 WARN  Plain message',
  '[Thu Feb 26 07:41:25 2026] [error] [client 1.2.3.4] Forbidden',
];
for (const line of msgCases) {
  const r = await lvl(line);
  const m = r?.message ?? '';
  const startsWithLevel = /^(INFO|WARN|ERROR|FATAL|DEBUG|TRACE)\b/i.test(m);
  const startsWithBracket = m.startsWith('[');
  const ok = !startsWithLevel && !startsWithBracket;
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  msg=${JSON.stringify(m.slice(0, 60))}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
