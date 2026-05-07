import React from 'react';
import { useStore } from '../lib/store.js';

export default function DetailDrawer() {
  const detail = useStore(s => s.detail);
  const close = useStore(s => s.closeDetail);
  if (!detail) return null;

  const { record, before = [], after = [], loading, error } = detail;

  const copy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={close}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[42rem] max-w-full bg-bg-elev border-l border-border flex flex-col shadow-xl"
      >
        <header className="h-11 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <span className={`lvl-${record.level || 'UNKNOWN'} font-semibold text-sm`}>{record.level || 'UNKNOWN'}</span>
            <span className="text-xs text-text-muted font-mono">{record.file}:{record.lineNo}</span>
          </div>
          <button onClick={close} className="text-text-muted hover:text-text">✕</button>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-4 text-xs">
          <Field label="Timestamp" value={record.ts ? new Date(record.ts).toISOString().replace('Z', ' UTC') : '—'} />
          {record.logger && <Field label="Logger" value={record.logger} mono />}
          {record.thread && <Field label="Thread" value={record.thread} mono />}
          {record.context && <Field label="Context" value={record.context} mono />}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Message</h3>
              <button onClick={() => copy(record.message)} className="text-[11px] text-text-muted hover:text-accent">Copy</button>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] bg-bg-panel border border-border rounded p-2 max-h-72 overflow-auto">{record.message}</pre>
          </div>

          {record.meta && Object.keys(record.meta).length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">Parsed fields</h3>
              <pre className="font-mono text-[11px] bg-bg-panel border border-border rounded p-2 overflow-auto">{JSON.stringify(record.meta, null, 2)}</pre>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Raw</h3>
              <button onClick={() => copy(record.raw)} className="text-[11px] text-text-muted hover:text-accent">Copy raw</button>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] bg-bg-panel border border-border rounded p-2 max-h-48 overflow-auto">{record.raw}</pre>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Context {loading && '· loading…'} {error && <span className="text-level-error">· {error}</span>}
            </h3>
            <div className="bg-bg-panel border border-border rounded font-mono text-[11px]">
              {before.map((r, i) => <ContextRow key={`b${i}`} r={r} />)}
              <div className="px-2 py-1 border-y border-accent/40 bg-accent/10">
                <ContextRow r={record} highlight />
              </div>
              {after.map((r, i) => <ContextRow key={`a${i}`} r={r} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextRow({ r, highlight }) {
  const lvl = r.level || 'UNKNOWN';
  return (
    <div className={`flex gap-2 px-2 py-0.5 ${highlight ? '' : 'opacity-80'}`}>
      <span className="text-text-dim w-12 shrink-0 text-right">{r.lineNo}</span>
      <span className={`lvl-${lvl} w-12 shrink-0`}>{lvl}</span>
      <span className="flex-1 truncate">{r.message?.split('\n')[0]}</span>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 items-baseline">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={mono ? 'font-mono text-xs break-all' : 'text-xs'}>{value}</div>
    </div>
  );
}
