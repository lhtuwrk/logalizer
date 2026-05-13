import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.js';
import { api } from '../lib/api.js';

const FIELDS = [
  { key: 'timestamp', label: 'Time',    color: '#7aa2ff' },
  { key: 'level',     label: 'Level',   color: '#ffb86b' },
  { key: 'logger',    label: 'Logger',  color: '#86c285' },
  { key: 'thread',    label: 'Thread',  color: '#c792ea' },
  { key: 'context',   label: 'Context', color: '#56c7e6' },
  { key: 'message',   label: 'Message', color: '#a0a0a0' },
];
const FIELD_COLOR = Object.fromEntries(FIELDS.map(f => [f.key, f.color]));

// Render the sample as a row of individual char spans the user can drag-select.
// Mouse-down picks a start, mouse-move updates the end, mouse-up commits.
function SelectableLine({ text, spans, hoverRange, onMouseDown, onMouseEnter, onMouseUp }) {
  // Pre-compute, for each char index, the span (if any) that covers it.
  const charField = useMemo(() => {
    const arr = new Array(text.length).fill(null);
    for (const sp of spans) for (let i = sp.start; i < sp.end; i++) arr[i] = sp.field;
    return arr;
  }, [text, spans]);

  return (
    <div
      className="font-mono text-[13px] leading-6 whitespace-pre select-none cursor-text"
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ wordBreak: 'break-all' }}
    >
      {[...text].map((ch, i) => {
        const f = charField[i];
        const inHover = hoverRange && i >= hoverRange[0] && i < hoverRange[1];
        const bg = inHover ? '#ffffff22' : f ? FIELD_COLOR[f] + '55' : 'transparent';
        const border = inHover ? '1px solid #fff' : f ? `1px solid ${FIELD_COLOR[f]}aa` : '1px solid transparent';
        return (
          <span
            key={i}
            data-i={i}
            onMouseDown={(e) => onMouseDown(i, e)}
            onMouseEnter={() => onMouseEnter(i)}
            style={{ background: bg, borderBottom: border, padding: '1px 0' }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        );
      })}
    </div>
  );
}

export default function CustomParser() {
  const open = useStore(s => s.customParserOpen);
  const samples = useStore(s => s.samples);
  const close = useStore(s => s.closeCustomParser);
  const apply = useStore(s => s.applyCustomParser);

  const [fileIdx, setFileIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [spans, setSpans] = useState([]);          // [{field,start,end}]
  const [drag, setDrag] = useState(null);          // { start, end } while dragging
  const [preview, setPreview] = useState(null);    // server preview response
  const [err, setErr] = useState(null);

  const file = samples?.[fileIdx];
  const lines = file?.lines || [];
  const sample = lines[lineIdx] || '';

  // Reset spans whenever the sample line changes.
  useEffect(() => { setSpans([]); setPreview(null); setErr(null); }, [fileIdx, lineIdx, samples]);

  // Live preview by hitting the server whenever spans change.
  useEffect(() => {
    if (!sample || spans.length === 0) { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const p = await api.previewParser({ sample, spans, line: sample });
        if (!cancelled) { setPreview(p); setErr(null); }
      } catch (e) {
        if (!cancelled) { setErr(e.message); setPreview(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [sample, spans]);

  if (!open) return null;

  function onMouseDown(i, e) {
    e.preventDefault();
    setDrag({ start: i, end: i + 1 });
  }
  function onMouseEnter(i) {
    if (!drag) return;
    setDrag(d => ({ start: d.start, end: i + 1 }));
  }
  function onMouseUp() {
    setDrag(null);
  }

  const pendingRange = drag
    ? [Math.min(drag.start, drag.end - 1), Math.max(drag.start + 1, drag.end)]
    : null;

  function assign(field) {
    if (!pendingRange && !drag) return;
    const range = pendingRange || [drag.start, drag.end];
    const [start, end] = range;
    if (end <= start) return;
    // Remove any existing spans that overlap the new range, then insert.
    const remaining = spans.filter(s => s.end <= start || s.start >= end);
    setSpans([...remaining, { field, start, end }].sort((a, b) => a.start - b.start));
    setDrag(null);
  }
  function removeSpan(idx) {
    setSpans(spans.filter((_, i) => i !== idx));
  }
  function clearAll() { setSpans([]); setDrag(null); setPreview(null); }

  function onApply() {
    if (!spans.length) { setErr('Select at least one field first.'); return; }
    apply({ sample, spans });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.6)' }}
         onClick={close}>
      <div className="bg-bg-panel border border-border rounded-lg shadow-2xl w-[min(95vw,1100px)] max-h-[90vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="text-sm font-semibold">Custom log format</div>
            <div className="text-xs text-text-muted">Drag-select a part of the sample line, then tag it with a field.</div>
          </div>
          <button onClick={close} className="text-text-muted hover:text-text text-xl leading-none">×</button>
        </div>

        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-text-muted">File</span>
          <select className="bg-bg-elev border border-border rounded px-2 py-1 text-xs"
                  value={fileIdx}
                  onChange={(e) => { setFileIdx(Number(e.target.value)); setLineIdx(0); }}>
            {(samples || []).map((f, i) => (
              <option key={f.file} value={i}>{f.file}</option>
            ))}
          </select>
          <span className="text-[11px] text-text-muted">Line</span>
          <select className="bg-bg-elev border border-border rounded px-2 py-1 text-xs max-w-[420px]"
                  value={lineIdx}
                  onChange={(e) => setLineIdx(Number(e.target.value))}>
            {lines.map((l, i) => (
              <option key={i} value={i}>{`#${i + 1}: ${l.slice(0, 80)}${l.length > 80 ? '…' : ''}`}</option>
            ))}
          </select>
        </div>

        <div className="px-4 py-4 border-b border-border overflow-auto">
          {sample ? (
            <SelectableLine
              text={sample}
              spans={spans}
              hoverRange={pendingRange}
              onMouseDown={onMouseDown}
              onMouseEnter={onMouseEnter}
              onMouseUp={onMouseUp}
            />
          ) : (
            <div className="text-text-muted text-xs">No sample lines available.</div>
          )}
        </div>

        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-text-muted mr-1">Assign selection →</span>
          {FIELDS.map(f => (
            <button key={f.key}
                    onClick={() => assign(f.key)}
                    disabled={!drag && !pendingRange}
                    className="text-[11px] px-2 py-1 rounded border"
                    style={{ borderColor: f.color, color: f.color, opacity: (drag || pendingRange) ? 1 : 0.4 }}>
              {f.label}
            </button>
          ))}
          <button onClick={clearAll}
                  className="ml-auto text-[11px] px-2 py-1 rounded border border-border text-text-muted hover:text-text">
            Clear all
          </button>
        </div>

        {spans.length > 0 && (
          <div className="px-4 py-3 border-b border-border flex flex-wrap gap-2">
            {spans.map((sp, i) => (
              <span key={i}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                    style={{ background: FIELD_COLOR[sp.field] + '33', border: `1px solid ${FIELD_COLOR[sp.field]}88` }}>
                <strong>{sp.field}</strong>
                <span className="text-text-muted">"{sample.slice(sp.start, sp.end)}"</span>
                <button onClick={() => removeSpan(i)} className="ml-1 text-text-muted hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="px-4 py-3 flex-1 overflow-auto">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Preview</div>
          {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
          {preview ? (
            <div className="space-y-2 text-xs font-mono">
              <Row label="regex"   value={preview.regex} />
              {preview.result ? (
                <>
                  <Row label="ts"      value={preview.result.ts != null ? new Date(preview.result.ts).toISOString() : '—'} />
                  <Row label="level"   value={preview.result.level || '—'} />
                  <Row label="logger"  value={preview.result.logger || '—'} />
                  <Row label="thread"  value={preview.result.thread || '—'} />
                  <Row label="context" value={preview.result.context || '—'} />
                  <Row label="message" value={preview.result.message || '—'} />
                </>
              ) : (
                <div className="text-red-400">The generated regex does not match this line.</div>
              )}
            </div>
          ) : (
            <div className="text-text-muted text-xs">Select parts of the sample and tag them to see a preview.</div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={close} className="btn text-xs">Cancel</button>
          <button onClick={onApply}
                  disabled={!spans.length || (preview && !preview.result)}
                  className="btn-accent text-xs">Apply &amp; re-parse</button>
        </div>

        <style>{`
          .btn { background: rgb(21 25 33); border: 1px solid rgb(34 40 51); color: inherit;
                 padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
          .btn:hover { background: rgb(27 33 44); }
          .btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .btn-accent { background: #1f3a8a33; border: 1px solid #7aa2ff; color: #9bb8ff;
                        padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
          .btn-accent:hover { background: #1f3a8a55; }
          .btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }
          html:not(.dark) .btn { background: #ffffff; border: 1px solid #e5e7eb; }
          html:not(.dark) .btn:hover { background: #f3f4f6; }
        `}</style>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 shrink-0 text-text-muted">{label}</span>
      <span className="flex-1 break-all">{String(value)}</span>
    </div>
  );
}
