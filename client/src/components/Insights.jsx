import React from 'react';
import { useStore } from '../lib/store.js';

export default function Insights() {
  const summary = useStore(s => s.summary);
  const setFilter = useStore(s => s.setFilter);
  const jumpToFirstMatch = useStore(s => s.jumpToFirstMatch);
  if (!summary) return null;

  const top = summary.topErrors || [];
  const hints = summary.rootCauseHints || [];
  const anomalies = summary.anomalies || [];

  return (
    <div className="p-3 space-y-4 text-sm">
      <Block title="Overview">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total" value={summary.total?.toLocaleString() || 0} />
          <Stat label="Errors" value={(summary.byLevel?.ERROR || 0) + (summary.byLevel?.FATAL || 0)} tone="error" />
          <Stat label="Warnings" value={summary.byLevel?.WARN || 0} tone="warn" />
          <Stat label="Info" value={summary.byLevel?.INFO || 0} tone="info" />
        </div>
        {summary.timeRange?.min && (
          <div className="mt-2 text-xs text-text-muted">
            {fmt(summary.timeRange.min)} → {fmt(summary.timeRange.max)}
          </div>
        )}
      </Block>

      {anomalies.length > 0 && (
        <Block title={`Anomalies (${anomalies.length})`}>
          <ul className="space-y-1.5 text-xs">
            {anomalies.slice(0, 8).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-bg-panel border border-border">
                <span className="text-text-muted">{fmt(a.ts)}</span>
                <span className="lvl-ERROR font-semibold">spike: {a.count}</span>
                <span className="text-text-dim">≥ {a.threshold}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title={`Top errors / warnings (${top.length})`}>
        <ul className="space-y-1.5">
          {top.slice(0, 12).map((e, i) => (
            <li
              key={i}
              onClick={() => { const t = extractSearchTerm(e.sample); setFilter({ search: t }); setTimeout(() => jumpToFirstMatch(t), 200); }}
              className="px-2 py-1.5 rounded bg-bg-panel border border-border hover:border-accent cursor-pointer"
              title="Click to filter logs and jump to first occurrence"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={`lvl-${e.level} font-semibold`}>{e.level}</span>
                <span className="text-text-muted">×{e.count}</span>
              </div>
              <div className="font-mono text-[11px] text-text mt-1 line-clamp-2 break-words">{e.sample}</div>
              {e.files?.length > 0 && (
                <div className="text-[10px] text-text-dim mt-1 truncate">in: {e.files.join(', ')}</div>
              )}
            </li>
          ))}
          {top.length === 0 && <li className="text-text-muted text-xs">No errors or warnings found.</li>}
        </ul>
      </Block>

      {hints.length > 0 && (
        <Block title={`Root-cause hints (${hints.length})`}>
          <ul className="space-y-1.5 text-xs">
            {hints.map((h, i) => (
              <li key={i} className="px-2 py-1.5 rounded bg-bg-panel border border-border">
                <div className="text-accent">{h.hint}</div>
                <div className="font-mono text-[10px] text-text-dim mt-1 line-clamp-2">{h.cluster}</div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Top loggers">
        <ul className="space-y-1 text-[11px]">
          {Object.entries(summary.byLogger || {}).slice(0, 10).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-2 truncate">
              <span className="truncate font-mono" title={k}>{k}</span>
              <span className="text-text-muted">{v}</span>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

function extractSearchTerm(sample) {
  // Take first meaningful word(s) for filtering
  const m = sample.match(/[A-Za-z][A-Za-z0-9_]{4,}/);
  return m ? m[0] : sample.slice(0, 40);
}

function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

function Block({ title, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }) {
  const cls = tone === 'error' ? 'text-level-error' : tone === 'warn' ? 'text-level-warn' : tone === 'info' ? 'text-level-info' : 'text-text';
  return (
    <div className="px-3 py-2 rounded bg-bg-panel border border-border">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
