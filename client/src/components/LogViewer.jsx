import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VariableSizeList as List } from 'react-window';
import { useStore } from '../lib/store.js';

const ROW_BASE = 28;

const ALL_COLS = [
  { key: 'timestamp', label: 'Timestamp', width: 'w-44' },
  { key: 'level',     label: 'Level',     width: 'w-12' },
  { key: 'file',      label: 'File',      width: 'w-40' },
  { key: 'logger',    label: 'Logger',    width: 'w-40' },
];
const DEFAULT_COLS = { timestamp: true, level: true, file: true, logger: true };

function loadCols() {
  try { return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem('log-cols') || '{}') }; }
  catch { return { ...DEFAULT_COLS }; }
}

export default function LogViewer() {
  const records = useStore(s => s.records);
  const monitor = useStore(s => s.monitor);
  const search = useStore(s => s.filter.search);
  const loading = useStore(s => s.loading);
  const loadingMore = useStore(s => s.loadingMore);
  const recordsTotal = useStore(s => s.recordsTotal);
  const summary = useStore(s => s.summary);
  const loadMoreRecords = useStore(s => s.loadMoreRecords);
  const openDetail = useStore(s => s.openDetail);
  const selectedIndex = useStore(s => s.selectedIndex);
  const setSelectedIndex = useStore(s => s.setSelectedIndex);
  const jumpRequest = useStore(s => s.jumpRequest);
  const hasMore = !monitor.active && records.length < recordsTotal;
  const [expanded, setExpanded] = useState(() => new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [cols, setCols] = useState(loadCols);
  const [colsOpen, setColsOpen] = useState(false);
  const listRef = useRef(null);
  const wrapRef = useRef(null);
  const colsMenuRef = useRef(null);
  const heightsRef = useRef(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });

  const toggleCol = (key) => {
    setCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('log-cols', JSON.stringify(next));
      return next;
    });
    // Column layout changed — remeasure all rows
    setTimeout(() => { heightsRef.current.clear(); listRef.current?.resetAfterIndex(0); }, 0);
  };

  // Close columns menu on outside click
  useEffect(() => {
    if (!colsOpen) return;
    const handler = (e) => { if (colsMenuRef.current && !colsMenuRef.current.contains(e.target)) setColsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colsOpen]);

  const showMonitor = monitor.active && monitor.lines.length > 0;
  const data = showMonitor ? monitor.lines : records;

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // When the data array changes, drop measurements (indices now point to different rows).
  useEffect(() => {
    heightsRef.current.clear();
    setExpanded(new Set());
    listRef.current?.resetAfterIndex(0);
  }, [data]);

  // When the viewport width changes, expanded rows wrap differently — invalidate.
  useEffect(() => {
    heightsRef.current.clear();
    listRef.current?.resetAfterIndex(0);
  }, [size.w]);

  useEffect(() => {
    if (autoScroll && showMonitor && listRef.current && data.length > 0) {
      listRef.current.scrollToItem(data.length - 1, 'end');
    }
  }, [data.length, autoScroll, showMonitor]);

  // Honor jump requests (e.g. clicking a top-error cluster)
  useEffect(() => {
    if (jumpRequest > 0 && selectedIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIndex, 'center');
    }
  }, [jumpRequest, selectedIndex]);

  // Arrow-key navigation when not typing
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (data.length === 0) return;
      let next = selectedIndex;
      if (e.key === 'ArrowDown' || e.key === 'j') next = Math.min(data.length - 1, (selectedIndex < 0 ? 0 : selectedIndex + 1));
      else if (e.key === 'ArrowUp' || e.key === 'k') next = Math.max(0, (selectedIndex < 0 ? 0 : selectedIndex - 1));
      else if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); openDetail(data[selectedIndex]); return; }
      else if (e.key === 'e' && selectedIndex >= 0) { e.preventDefault(); toggleAt(selectedIndex); return; }
      else return;
      e.preventDefault();
      setSelectedIndex(next);
      listRef.current?.scrollToItem(next, 'smart');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedIndex]);

  const toggleAt = useCallback((index) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(index)) { n.delete(index); heightsRef.current.delete(index); }
      else n.add(index);
      return n;
    });
    listRef.current?.resetAfterIndex(index);
  }, []);

  const itemSize = useCallback((index) => {
    if (!expanded.has(index)) return ROW_BASE;
    return heightsRef.current.get(index) ?? ROW_BASE;
  }, [expanded]);

  const reportHeight = useCallback((index, h) => {
    const prev = heightsRef.current.get(index);
    if (prev !== h) {
      heightsRef.current.set(index, h);
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

  const toggle = toggleAt;

  const onItemsRendered = useCallback(({ visibleStopIndex }) => {
    if (hasMore && visibleStopIndex >= records.length - 40) {
      loadMoreRecords();
    }
  }, [hasMore, records.length, loadMoreRecords]);

  const headerHeight = summary?.truncated ? 60 : 36;

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 min-h-0 flex flex-col bg-bg">
      <div className="px-3 flex flex-col justify-center border-b border-border" style={{ minHeight: headerHeight }}>
        <div className="flex items-center justify-between text-xs text-text-muted h-9">
          <div>
            {showMonitor ? (
              <>Live tailing · {data.length.toLocaleString()} new lines</>
            ) : (
              <>
                Showing {data.length.toLocaleString()}{recordsTotal > data.length ? ` of ${recordsTotal.toLocaleString()}` : ''} records
                {loading && ' · refreshing…'}
                {loadingMore && ' · loading more…'}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {showMonitor && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                Auto-scroll
              </label>
            )}
            {expanded.size > 0 && (
              <button
                onClick={() => { setExpanded(new Set()); heightsRef.current.clear(); listRef.current?.resetAfterIndex(0); }}
                className="hover:text-text"
              >Collapse all ({expanded.size})</button>
            )}
            <span className="opacity-70">click row to expand</span>
            {/* Column visibility toggle */}
            <div className="relative" ref={colsMenuRef}>
              <button
                onClick={() => setColsOpen(v => !v)}
                className={`flex items-center gap-1 hover:text-text ${colsOpen ? 'text-accent' : ''}`}
                title="Show/hide columns"
              >
                <ColsIcon /> Columns
              </button>
              {colsOpen && (
                <div className="absolute right-0 top-full mt-1 bg-bg-panel border border-border rounded-md shadow-xl z-20 py-1 min-w-[140px]">
                  {ALL_COLS.map(c => (
                    <label key={c.key} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg-hover">
                      <input
                        type="checkbox"
                        checked={!!cols[c.key]}
                        onChange={() => toggleCol(c.key)}
                        className="accent-accent"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {summary?.truncated && (
          <div className="pb-1.5 text-[11px] text-amber-400/80">
            ⚠ INFO/DEBUG/TRACE capped at 100k records — all WARN/ERROR/FATAL are always stored and searchable
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">
            No records match the current filters.
          </div>
        ) : (
          <List
            ref={listRef}
            height={Math.max(120, size.h - headerHeight)}
            width={size.w}
            itemCount={data.length}
            itemSize={itemSize}
            estimatedItemSize={ROW_BASE}
            overscanCount={10}
            onItemsRendered={onItemsRendered}
            itemData={{ data, expanded, search, toggle, reportHeight, selectedIndex, openDetail, setSelectedIndex, cols }}
          >
            {Row}
          </List>
        )}
      </div>
    </div>
  );
}

function Row({ index, style, data: itemData }) {
  const { data, expanded, search, toggle, reportHeight, selectedIndex, openDetail, setSelectedIndex, cols } = itemData;
  const r = data[index];
  const isExpanded = expanded.has(index);
  const isSelected = selectedIndex === index;
  const innerRef = useRef(null);

  // After render, measure actual height when expanded and report back so the list
  // can size the row correctly.
  useEffect(() => {
    if (!isExpanded || !innerRef.current) return;
    const measure = () => {
      if (innerRef.current) reportHeight(index, innerRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [isExpanded, index, reportHeight, r?.message]);

  if (!r) return null;
  const lvl = r.level || 'UNKNOWN';

  return (
    <div style={style} className="bg-bg">
      <div
        ref={innerRef}
        onClick={() => { setSelectedIndex(index); toggle(index); }}
        onDoubleClick={() => openDetail(r)}
        className={`row-${lvl} group flex items-start gap-3 px-3 py-1 border-l-2 border-b border-border-subtle font-mono text-xs cursor-pointer ${isSelected ? 'bg-bg-hover' : 'hover:bg-bg-hover'}`}
      >
        {cols.timestamp && (
          <span className="text-text-dim w-44 shrink-0 truncate" title={r.ts ? new Date(r.ts).toISOString() : ''}>
            {r.ts ? formatTs(r.ts) : '—'}
          </span>
        )}
        {cols.level && <span className={`lvl-${lvl} w-12 shrink-0 font-semibold`}>{lvl}</span>}
        {cols.file && r.file && <span className="text-text-muted w-40 shrink-0 truncate" title={r.file}>{r.file}</span>}
        {cols.logger && r.logger && <span className="text-text-muted w-40 shrink-0 truncate" title={r.logger}>{shortLogger(r.logger)}</span>}
        <span className={`flex-1 min-w-0 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
          {highlight(r.message, search)}
        </span>
        <CopyButton text={r.raw || r.message || ''} />
        <button
          onClick={(e) => { e.stopPropagation(); openDetail(r); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent text-[11px] px-1"
          title="Open detail (Enter)"
        >→</button>
      </div>
    </div>
  );
}

function ColsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="4" height="12" rx="1" />
      <rect x="6" y="2" width="4" height="12" rx="1" />
      <rect x="11" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = React.useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent text-[11px] px-1"
      title="Copy raw line"
    >{copied ? '✓' : '⎘'}</button>
  );
}

function formatTs(ms) {
  const d = new Date(ms);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

function shortLogger(s) {
  if (!s) return '';
  const parts = s.split('.');
  if (parts.length <= 2) return s;
  return parts.slice(0, -2).map(p => p[0]).join('.') + '.' + parts.slice(-2).join('.');
}

function highlight(text, q) {
  if (!q) return text;
  try {
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    const parts = String(text).split(re);
    return parts.map((p, i) => i % 2 === 1 ? <mark key={i} className="search-hit">{p}</mark> : p);
  } catch { return text; }
}
