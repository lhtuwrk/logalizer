import React, { useState } from 'react';
import { useStore } from '../lib/store.js';
import { api } from '../lib/api.js';

function isValidRegex(s) {
  try { new RegExp(s); return true; } catch { return false; }
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="filter-chip">
      {label}
      <button onClick={onRemove} title="Remove filter">×</button>
    </span>
  );
}

export default function Topbar() {
  const sessionId = useStore(s => s.sessionId);
  const filter = useStore(s => s.filter);
  const setFilter = useStore(s => s.setFilter);
  const resetFilter = useStore(s => s.resetFilter);
  const recordsTotal = useStore(s => s.recordsTotal);
  const recordCount = useStore(s => s.recordCount);
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const activeChips = [];
  (filter.files || []).forEach(f => activeChips.push({ key: `file-${f}`, label: `file: ${f.split(/[\\/]/).pop()}`, onRemove: () => setFilter({ files: (filter.files || []).filter(x => x !== f) }) }));
  (filter.level || []).forEach(lvl => activeChips.push({ key: `lvl-${lvl}`, label: lvl, onRemove: () => setFilter({ level: (filter.level || []).filter(l => l !== lvl) }) }));
  if (filter.search) activeChips.push({ key: 'search', label: `"${filter.search}"`, onRemove: () => setFilter({ search: '' }) });
  if (filter.from || filter.to) activeChips.push({ key: 'time', label: 'time range', onRemove: () => setFilter({ from: null, to: null }) });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
  };

  const exportFmt = (fmt) => {
    if (!sessionId) return;
    const url = api.exportUrl(sessionId, fmt, {
      level: (filter.level || []).join(',') || undefined,
      files: (filter.files || []).join(',') || undefined,
      search: filter.search || undefined,
    });
    window.open(url, '_blank');
  };

  return (
    <div className="shrink-0 border-b border-border bg-bg-elev">
      <header className="h-12 flex items-center px-4 gap-3">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold tracking-tight">Logalizer</span>
        </div>
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="relative">
            <input
              type="search"
              placeholder={sessionId ? "Search logs (regex aware)  ·  press '/'" : 'Load logs to start searching'}
              disabled={!sessionId}
              value={filter.search}
              onChange={(e) => setFilter({ search: e.target.value })}
              className="w-full bg-bg-panel border border-border rounded-md pl-9 pr-12 py-1.5 text-sm placeholder:text-text-dim focus:border-accent disabled:opacity-50"
            />
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            {filter.search && (
              <span
                className={`absolute right-8 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${isValidRegex(filter.search) ? 'bg-green-500' : 'bg-red-500'}`}
                title={isValidRegex(filter.search) ? 'Valid regex' : 'Invalid regex — searching as literal text'}
              />
            )}
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted hidden md:block">/</kbd>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="text-xs text-text-muted hidden md:inline">
              {recordsTotal.toLocaleString()} / {recordCount.toLocaleString()} records
            </span>
          )}
          {sessionId && (
            <div className="flex items-center gap-1 text-xs">
              <button onClick={() => exportFmt('json')} className="btn-ghost">JSON</button>
              <button onClick={() => exportFmt('csv')} className="btn-ghost">CSV</button>
              <button onClick={() => exportFmt('html')} className="btn-ghost">Report</button>
            </div>
          )}
          <button onClick={toggleTheme} className="btn-ghost" title="Toggle theme">
            {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
          </button>
        </div>
      </header>
      {sessionId && activeChips.length > 0 && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 flex-wrap border-t border-border-subtle">
          <span className="text-[10px] text-text-muted mr-0.5">Active filters:</span>
          {activeChips.map(c => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
          {activeChips.length > 1 && (
            <button onClick={resetFilter} className="text-[10px] text-text-muted hover:text-accent ml-1">clear all</button>
          )}
        </div>
      )}
      <style>{`
        .btn-ghost {
          padding: 4px 8px; border-radius: 6px; border: 1px solid transparent;
          color: inherit; background: transparent; cursor: pointer;
        }
        .btn-ghost:hover { background: rgba(138, 147, 163, 0.12); }
        /* dark mode filter-chip defaults (light mode overridden in index.css) */
        .filter-chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; padding: 1px 6px; border-radius: 4px;
          background: rgba(122,162,255,0.12); border: 1px solid rgba(122,162,255,0.35);
          color: #9bb8ff;
        }
        .filter-chip button {
          background: none; border: none; cursor: pointer; color: inherit;
          font-size: 14px; line-height: 1; padding: 0; opacity: 0.7;
        }
        .filter-chip button:hover { opacity: 1; }
      `}</style>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8L10 12L6 16" stroke="currentColor" strokeWidth="2" />
      <path d="M13 9H21" stroke="currentColor" strokeWidth="2" />
      <path d="M13 15H19" stroke="currentColor" strokeWidth="2" />
      <circle cx="21" cy="15" r="1.8" fill="#22c55e" />
    </svg>
  );
}
function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
function SunIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}
function MoonIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
