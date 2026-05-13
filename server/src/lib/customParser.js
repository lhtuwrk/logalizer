// Builds a parser function from a user-marked sample line.
//
// Input shape:
//   { sample: "the full sample line",
//     spans: [{ field: 'timestamp'|'level'|'logger'|'thread'|'context'|'message',
//                start: <int>, end: <int> }, ...] }
//
// Output: a function (line, lineNo, file) -> normalized record or null (no match).
//
// Approach: build a regex by walking the sample. Inside each marked span we
// emit a capture group with a pattern generalised for that field. Between spans
// we emit the literal characters from the sample (whitespace runs are made
// flexible via \s+). Trailing content after the last span is captured into the
// message field.

import { normalizeLevel, tsToMs } from './parser.js';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Convert literal text between spans into a regex fragment. Runs of whitespace
// become \s+ so the pattern stays tolerant. Everything else is escaped.
function literalToRegex(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      while (i < text.length && /\s/.test(text[i])) i++;
      out += '\\s+';
    } else {
      out += escapeRe(text[i]);
      i++;
    }
  }
  return out;
}

// Produce a regex body matching the *shape* of a span based on its field type
// and the literal content the user selected.
function patternFor(text, field) {
  if (field === 'message') return '.*';

  if (field === 'timestamp') {
    // Replace digits with \d, keep separators literal, allow flexible
    // fractional seconds and timezone suffix.
    let p = '';
    for (const ch of text) {
      if (/\d/.test(ch)) p += '\\d';
      else if (/[A-Za-z]/.test(ch)) p += ch; // T, Z literally
      else if (/\s/.test(ch)) p += '\\s+';
      else p += escapeRe(ch);
    }
    // Allow optional fractional seconds even if the sample had none.
    if (!/\.\\d/.test(p) && !/,\\d/.test(p)) {
      p = p.replace(/(\\d{2}):(\\d{2}):(\\d{2})/, '$1:$2:$3(?:[.,]\\d{1,9})?');
    }
    return p;
  }

  if (field === 'level') {
    // Match any of the known level words case-insensitively, or any uppercase
    // word that looks like a level. Allow short single-char Logcat-style.
    return '[A-Za-z]{1,9}';
  }

  // Identifier-like fields (logger / thread / context): permissive enough to
  // tolerate variants the user's sample doesn't show — e.g. nested namespaces
  // like `foo::bar`, dotted Java packages, slashes, dashes.
  return '[\\w$.:\\-/]+';
}

function buildRegex(sample, spans) {
  const ordered = [...spans]
    .filter(s => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);

  // Reject overlapping spans — the regex would be ambiguous.
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start < ordered[i - 1].end) {
      throw new Error('spans overlap');
    }
  }

  let regex = '^';
  const captures = [];
  let cursor = 0;
  for (const sp of ordered) {
    if (sp.start > cursor) {
      regex += literalToRegex(sample.slice(cursor, sp.start));
    }
    const spanText = sample.slice(sp.start, sp.end);
    regex += '(' + patternFor(spanText, sp.field) + ')';
    captures.push(sp.field);
    cursor = sp.end;
  }
  // Tail handling: if last span is not 'message', capture remaining text into message.
  const last = ordered[ordered.length - 1];
  if (!last || last.field !== 'message') {
    if (cursor < sample.length) {
      regex += literalToRegex(sample.slice(cursor));
    }
    regex += '\\s*(.*)$';
    captures.push('message');
  } else {
    regex += '$';
  }
  return { regex, captures, spans: ordered };
}

export function buildCustomParser(spec) {
  if (!spec || typeof spec.sample !== 'string' || !Array.isArray(spec.spans)) {
    throw new Error('invalid spec: expected { sample, spans[] }');
  }
  const { regex, captures } = buildRegex(spec.sample, spec.spans);
  const re = new RegExp(regex);

  function parse(line, lineNo, file) {
    const m = line.match(re);
    if (!m) return null;
    const fields = {};
    for (let i = 0; i < captures.length; i++) {
      const name = captures[i];
      const val = m[i + 1];
      if (val == null) continue;
      if (name === 'message' && fields.message) {
        fields.message += ' ' + val;
      } else {
        fields[name] = val;
      }
    }
    return {
      ts: fields.timestamp ? tsToMs(String(fields.timestamp).trim()) : null,
      level: fields.level ? normalizeLevel(fields.level) : null,
      logger: fields.logger || null,
      thread: fields.thread || null,
      context: fields.context || null,
      message: (fields.message || '').trim() || line,
      raw: line,
      lineNo,
      file,
    };
  }
  parse.regexSource = regex;
  parse.captures = captures;
  return parse;
}

// Convenience: build, apply to one line, return preview.
export function previewCustomParser(spec, line) {
  const parser = buildCustomParser(spec);
  const result = parser(line, 1, null);
  return { regex: parser.regexSource, captures: parser.captures, result };
}
