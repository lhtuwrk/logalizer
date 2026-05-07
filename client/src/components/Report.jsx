import React from 'react';
import { useStore } from '../lib/store.js';
import { api } from '../lib/api.js';

export default function Report() {
  const report = useStore(s => s.report);
  const sessionId = useStore(s => s.sessionId);
  if (!report) return <div className="p-6 text-text-muted text-xs">No investigation report yet.</div>;

  const { summary } = report;
  const top = summary?.topErrors || [];
  const hints = report.rootCauseHints || [];

  return (
    <div className="p-3 space-y-4 text-xs">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Investigation Report</h2>
          <div className="text-text-muted text-[11px] mt-1 break-all">{report.root}</div>
        </div>
        <button
          onClick={() => window.open(api.exportUrl(sessionId, 'html'), '_blank')}
          className="px-2 py-1 rounded border border-border hover:border-accent text-[11px]"
        >Open printable</button>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Files" value={report.fileCount} />
        <Stat label="Records" value={report.recordCount?.toLocaleString()} />
        <Stat label="Errors" value={(summary.byLevel?.ERROR || 0) + (summary.byLevel?.FATAL || 0)} tone="error" />
        <Stat label="Warnings" value={summary.byLevel?.WARN || 0} tone="warn" />
      </div>

      <Section title="Files scanned">
        <ul className="space-y-1">
          {(report.files || []).map((f, i) => (
            <li key={i} className="px-2 py-1.5 rounded bg-bg-panel border border-border">
              <div className="flex justify-between gap-2">
                <span className="font-mono truncate">{f.name}</span>
                <span className="text-text-muted shrink-0">{formatBytes(f.size)}</span>
              </div>
              {Object.keys(f.levels || {}).length > 0 && (
                <div className="mt-1 text-[10px] text-text-dim flex flex-wrap gap-2">
                  {Object.entries(f.levels).map(([k, v]) => (
                    <span key={k} className={`lvl-${k}`}>{k}:{v}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Top errors (${top.length})`}>
        <ul className="space-y-1">
          {top.slice(0, 10).map((e, i) => (
            <li key={i} className="px-2 py-1.5 rounded bg-bg-panel border border-border">
              <div className="flex justify-between gap-2 text-[11px]">
                <span className={`lvl-${e.level} font-semibold`}>{e.level}</span>
                <span className="text-text-muted">×{e.count}</span>
              </div>
              <div className="font-mono text-[11px] mt-1 line-clamp-3 break-words">{e.sample}</div>
            </li>
          ))}
        </ul>
      </Section>

      {hints.length > 0 && (
        <Section title="Possible causes">
          <ul className="space-y-1">
            {hints.map((h, i) => (
              <li key={i} className="px-2 py-1.5 rounded bg-bg-panel border border-border text-accent">{h.hint}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }) {
  const cls = tone === 'error' ? 'text-level-error' : tone === 'warn' ? 'text-level-warn' : 'text-text';
  return (
    <div className="px-3 py-2 rounded bg-bg-panel border border-border">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function formatBytes(b) {
  if (b == null) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}
