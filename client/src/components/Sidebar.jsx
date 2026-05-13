import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.js';

const LEVELS = ['ERROR', 'FATAL', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

export default function Sidebar() {
  const sessionId = useStore(s => s.sessionId);
  const files = useStore(s => s.files);
  const summary = useStore(s => s.summary);
  const filter = useStore(s => s.filter);
  const setFilter = useStore(s => s.setFilter);
  const resetFilter = useStore(s => s.resetFilter);
  const toggleFile = useStore(s => s.toggleFile);

  const pasteAnalyze = useStore(s => s.pasteAnalyze);
  const uploadAnalyze = useStore(s => s.uploadAnalyze);
  const removeFile = useStore(s => s.removeFile);
  const investigateFolder = useStore(s => s.investigateFolder);
  const startMonitor = useStore(s => s.startMonitor);
  const stopMonitor = useStore(s => s.stopMonitor);
  const monitor = useStore(s => s.monitor);
  const openCustomParser = useStore(s => s.openCustomParser);
  const recordCount = useStore(s => s.recordCount);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const uploadMenuRef = useRef(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);

  // Close upload menu on outside click
  useEffect(() => {
    if (!uploadMenuOpen) return;
    const handler = (e) => { if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target)) setUploadMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [uploadMenuOpen]);

  const toggleLevel = (lvl) => {
    const cur = new Set(filter.level || []);
    if (cur.has(lvl)) cur.delete(lvl); else cur.add(lvl);
    setFilter({ level: [...cur] });
  };

  return (
    <aside className="w-full border-r border-border bg-bg-elev flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 border-b border-border">
        <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Input</div>

        <div className="grid grid-cols-2 gap-2">
          {/* Auto-detect upload button */}
          <div className="relative" ref={uploadMenuRef}>
            <button
              onClick={() => setUploadMenuOpen(v => !v)}
              className={`btn text-xs w-full flex items-center justify-center gap-1.5 ${uploadMenuOpen ? 'bg-bg-hover' : ''}`}
            >
              <UploadIcon /> Upload
            </button>
            {uploadMenuOpen && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-bg-panel border border-border rounded-lg shadow-xl p-2 min-w-[160px]">
                <button
                  onClick={() => { fileInputRef.current?.click(); setUploadMenuOpen(false); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-md hover:bg-bg-hover flex items-center gap-2.5"
                >
                  <FileIcon /> <span><div className="font-medium">Files</div><div className="text-[10px] text-text-muted">Select one or more log files</div></span>
                </button>
                <button
                  onClick={() => { folderInputRef.current?.click(); setUploadMenuOpen(false); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-md hover:bg-bg-hover flex items-center gap-2.5 mt-0.5"
                >
                  <FolderIcon /> <span><div className="font-medium">Folder</div><div className="text-[10px] text-text-muted">Upload an entire directory</div></span>
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setPasteOpen(v => !v)} className="btn text-xs">Paste text</button>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            placeholder="Server folder path…"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            className="flex-1 bg-bg-panel border border-border rounded-md px-2 py-1 text-xs"
          />
          <button
            disabled={!folderPath}
            onClick={() => investigateFolder(folderPath)}
            className="btn text-xs px-2">Scan</button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".log,.txt,.json,.gz,.zip,text/plain,application/zip,application/gzip"
          onChange={(e) => e.target.files?.length && uploadAnalyze([...e.target.files])}
        />
        <input
          ref={folderInputRef}
          type="file"
          hidden
          /* @ts-ignore */
          webkitdirectory=""
          directory=""
          multiple
          onChange={(e) => e.target.files?.length && uploadAnalyze([...e.target.files])}
        />

        {pasteOpen && (
          <div className="mt-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste raw log lines here…"
              className="w-full h-32 bg-bg-panel border border-border rounded-md p-2 text-xs font-mono resize-y"
            />
            <button
              disabled={!pasteText.trim()}
              onClick={() => { pasteAnalyze(pasteText); setPasteOpen(false); }}
              className="btn-accent w-full mt-2 text-xs">Analyze pasted text</button>
          </div>
        )}
      </div>

      {sessionId && (() => {
        const unknown = summary?.byLevel?.UNKNOWN ?? 0;
        const total = recordCount || 1;
        const unparsedRatio = unknown / total;
        const looksBad = total < 3 || unparsedRatio > 0.5;
        return (
          <div className="px-3 py-2 border-b border-border-subtle">
            <button
              onClick={openCustomParser}
              className={`btn w-full text-xs flex items-center justify-center gap-1.5 ${looksBad ? 'btn-accent' : ''}`}
              title="Define a custom log format by selecting parts of a sample line"
            >
              <WrenchIcon /> Custom parser{looksBad ? ' (recommended)' : '…'}
            </button>
            {looksBad && (
              <div className="text-[11px] text-text-muted mt-1.5">
                Auto-detection produced {total} record{total === 1 ? '' : 's'} with mostly unknown fields. Use this to teach the parser.
              </div>
            )}
          </div>
        );
      })()}

      {sessionId && (
        <div className="flex-1 overflow-auto">
          <Section title="Sort & range">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] text-text-muted">Sort</span>
              <select
                value={filter.sort || 'time-asc'}
                onChange={(e) => setFilter({ sort: e.target.value })}
                className="flex-1 bg-bg-panel border border-border rounded px-2 py-1 text-xs"
              >
                <option value="time-asc">Time ↑ (merged)</option>
                <option value="time-desc">Time ↓ (newest first)</option>
                <option value="">File order</option>
              </select>
            </div>
            <TimeRange summary={summary} filter={filter} setFilter={setFilter} />
          </Section>
          <Section title="Levels">
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map(lvl => {
                const count = summary?.byLevel?.[lvl] ?? 0;
                const active = (filter.level || []).includes(lvl);
                return (
                  <button
                    key={lvl}
                    onClick={() => toggleLevel(lvl)}
                    className={`text-[11px] px-2 py-1 rounded border lvl-${lvl} ${active ? 'bg-bg-hover border-accent' : 'border-border hover:bg-bg-hover'}`}
                  >
                    {lvl} <span className="text-text-muted">{count}</span>
                  </button>
                );
              })}
            </div>
          </Section>
          <Section title={`Files (${files.length})`}>
            {files.length > 1 && (
              <div className="flex items-center justify-between mb-1.5">
                {(filter.files || []).length > 0 ? (
                  <span className="text-[11px] text-accent">{(filter.files || []).length} of {files.length} selected</span>
                ) : (
                  <span className="text-[11px] text-text-muted">Click to filter by file</span>
                )}
                {(filter.files || []).length > 0 && (
                  <button
                    onClick={() => setFilter({ files: [] })}
                    className="text-[11px] text-text-muted hover:text-accent"
                  >Clear</button>
                )}
              </div>
            )}
            <ul className="space-y-0.5">
              {files.map(f => {
                const active = (filter.files || []).includes(f.name);
                return (
                  <li key={f.name} className="group flex items-center gap-1">
                    <button
                      onClick={() => toggleFile(f.name)}
                      className={`flex-1 min-w-0 text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${active ? 'bg-bg-hover text-accent' : 'hover:bg-bg-hover'}`}
                      title={f.name}
                    >
                      <span className={`shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${active ? 'border-accent bg-accent/20' : 'border-border group-hover:border-text-muted'}`}>
                        {active && '✓'}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{f.name}</span>
                      <span className="text-text-dim shrink-0">{formatBytes(f.size)}</span>
                    </button>
                    <button
                      onClick={() => removeFile(f.name)}
                      title="Remove file"
                      className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-opacity text-sm leading-none"
                    >×</button>
                  </li>
                );
              })}
            </ul>
            {(filter.level?.length || filter.files?.length || filter.search || filter.from || filter.to) && (
              <button onClick={resetFilter} className="mt-2 text-xs text-text-muted hover:text-accent">Clear all filters</button>
            )}
          </Section>
          <Section title="Live monitor">
            {monitor.active ? (
              <div className="space-y-1">
                <div className="text-xs text-accent flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Watching {monitor.targets.length} target(s)
                </div>
                <button onClick={stopMonitor} className="btn w-full text-xs">Stop</button>
              </div>
            ) : (
              <MonitorControls onStart={startMonitor} />
            )}
          </Section>
        </div>
      )}

      <style>{`
        .btn { background: rgb(21 25 33); border: 1px solid rgb(34 40 51); color: inherit;
               padding: 6px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn:hover { background: rgb(27 33 44); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-accent { background: #1f3a8a33; border: 1px solid #7aa2ff; color: #9bb8ff;
                      padding: 6px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn-accent:hover { background: #1f3a8a55; }
        .btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }
        html:not(.dark) .btn { background: #ffffff; border: 1px solid #e5e7eb; }
        html:not(.dark) .btn:hover { background: #f3f4f6; }
      `}</style>
    </aside>
  );
}

function TimeRange({ summary, filter, setFilter }) {
  const min = summary?.timeRange?.min;
  const max = summary?.timeRange?.max;
  const fmt = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  const parse = (s) => {
    if (!s) return null;
    const t = Date.parse(s.endsWith('Z') ? s : s + ':00Z');
    return Number.isFinite(t) ? t : null;
  };
  const setPreset = (ms) => {
    if (!max) return;
    setFilter({ from: max - ms, to: max });
  };
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <input type="datetime-local" value={fmt(filter.from || min)}
          onChange={(e) => setFilter({ from: parse(e.target.value) })}
          className="bg-bg-panel border border-border rounded px-2 py-1 text-[11px]" />
        <input type="datetime-local" value={fmt(filter.to || max)}
          onChange={(e) => setFilter({ to: parse(e.target.value) })}
          className="bg-bg-panel border border-border rounded px-2 py-1 text-[11px]" />
      </div>
      <div className="flex gap-1 flex-wrap">
        {[
          ['5m', 5 * 60_000], ['1h', 60 * 60_000], ['6h', 6 * 60 * 60_000], ['24h', 24 * 60 * 60_000],
        ].map(([label, ms]) => (
          <button key={label} onClick={() => setPreset(ms)} className="text-[10px] px-2 py-0.5 rounded border border-border hover:border-accent">last {label}</button>
        ))}
        {(filter.from || filter.to) && (
          <button onClick={() => setFilter({ from: null, to: null })} className="text-[10px] px-2 py-0.5 rounded border border-border text-text-muted hover:text-accent">reset</button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

function MonitorControls({ onStart }) {
  const [path, setPath] = useState('');
  return (
    <div className="space-y-1">
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="File or folder path…"
        className="w-full bg-bg-panel border border-border rounded px-2 py-1 text-xs"
      />
      <button
        disabled={!path.trim()}
        onClick={() => onStart({ folder: path.trim() })}
        className="btn-accent w-full text-xs">Start watching</button>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M8 10V3M5 6l3-3 3 3" /><path d="M2 12h12" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" /><path d="M9 2v4h4" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 1.5a3 3 0 0 0-3.9 3.9L1.5 11l3 3 5.6-5.6A3 3 0 0 0 14 4.5l-2 2-1.5-1.5 2-2Z" />
    </svg>
  );
}

function formatBytes(b) {
  if (b == null) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}
