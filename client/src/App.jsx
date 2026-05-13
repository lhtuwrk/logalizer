import React, { useCallback, useEffect, useRef, useState } from 'react';
import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import LogViewer from './components/LogViewer.jsx';
import RightPanel from './components/RightPanel.jsx';
import EmptyState from './components/EmptyState.jsx';
import Toast from './components/Toast.jsx';
import DetailDrawer from './components/DetailDrawer.jsx';
import CustomParser from './components/CustomParser.jsx';
import { useStore } from './lib/store.js';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const RIGHT_MIN = 240;
const RIGHT_MAX = 640;

// direction: 1 = handle on right edge (sidebar), -1 = handle on left edge (right panel)
function useResizableWidth(storageKey, defaultWidth, min, max, direction = 1) {
  const [width, setWidth] = useState(() => {
    const v = parseInt(localStorage.getItem(storageKey));
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : defaultWidth;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const delta = (e.clientX - startX.current) * direction;
      const next = Math.max(min, Math.min(max, startW.current + delta));
      setWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(w => { localStorage.setItem(storageKey, String(w)); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [storageKey, min, max, direction]);

  return [width, onMouseDown];
}

export default function App() {
  const sessionId = useStore(s => s.sessionId);
  const error = useStore(s => s.error);
  const busyMessage = useStore(s => s.busyMessage);
  const setError = useStore(s => s.setError);

  const [sidebarWidth, onSidebarDrag] = useResizableWidth('panel-sidebar', 288, SIDEBAR_MIN, SIDEBAR_MAX, 1);
  const [rightWidth, onRightDrag] = useResizableWidth('panel-right', 320, RIGHT_MIN, RIGHT_MAX, -1);

  // Full-screen drag-drop
  const uploadAnalyze = useStore(s => s.uploadAnalyze);
  const [globalDrag, setGlobalDrag] = useState(false);
  const dragCount = useRef(0);
  useEffect(() => {
    const enter = (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragCount.current++;
      setGlobalDrag(true);
    };
    const leave = () => {
      dragCount.current = Math.max(0, dragCount.current - 1);
      if (dragCount.current === 0) setGlobalDrag(false);
    };
    const over = (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); };
    const drop = (e) => {
      e.preventDefault();
      dragCount.current = 0;
      setGlobalDrag(false);
      const items = [...(e.dataTransfer?.files || [])];
      if (items.length) uploadAnalyze(items);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [uploadAnalyze]);

  // Refresh records when filter changes
  const filter = useStore(s => s.filter);
  const fetchRecords = useStore(s => s.fetchRecords);
  useEffect(() => {
    if (!sessionId) return;
    const t = setTimeout(() => fetchRecords(), 150);
    return () => clearTimeout(t);
  }, [filter.level, filter.files, filter.search, filter.from, filter.to, filter.sort, sessionId, fetchRecords]);

  // Global keyboard shortcuts
  const setFilter = useStore(s => s.setFilter);
  const resetFilter = useStore(s => s.resetFilter);
  const closeDetail = useStore(s => s.closeDetail);
  const detail = useStore(s => s.detail);
  useEffect(() => {
    const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const hasActiveFilter = filter.search || filter.files?.length || filter.level?.length || filter.from || filter.to;
    const onKey = (e) => {
      if (e.key === '/' && !isTyping(document.activeElement)) {
        e.preventDefault();
        const inp = document.querySelector('input[type="search"]');
        inp?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (detail) { closeDetail(); return; }
        if (isTyping(document.activeElement)) {
          document.activeElement.blur();
          return;
        }
        if (hasActiveFilter) resetFilter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filter, detail, setFilter, resetFilter, closeDetail]);

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <Topbar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar + drag handle */}
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex shrink-0 min-h-0">
          <Sidebar />
          <DragHandle onMouseDown={onSidebarDrag} />
        </div>
        <main className="flex-1 flex min-h-0 min-w-0">
          {sessionId ? (
            <>
              <LogViewer />
              <DragHandle onMouseDown={onRightDrag} />
              <div style={{ width: rightWidth, minWidth: rightWidth }} className="flex shrink-0 min-h-0">
                <RightPanel />
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
      {busyMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-bg-panel border border-border px-4 py-2 rounded-md shadow-lg flex items-center gap-3 text-sm">
          <Spinner /> {busyMessage}
        </div>
      )}
      {error && <Toast message={error} onClose={() => setError(null)} />}
      <DetailDrawer />
      <CustomParser />
      <ShortcutBar />
      {globalDrag && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
          <div style={{
            border: '2px dashed #7aa2ff', borderRadius: 16, padding: '48px 64px',
            textAlign: 'center', color: '#9bb8ff',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>↓</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Drop to analyze</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>log files, folders, or .zip archives</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DragHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="drag-handle"
      title="Drag to resize"
    />
  );
}

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  );
}

// ── Keyboard shortcut bar ─────────────────────────────────────────────────────

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '1px 6px', borderRadius: 4, fontSize: 11, lineHeight: '18px',
      border: '1px solid var(--sc-kbd-border)',
      background: 'var(--sc-kbd-bg)', color: 'var(--sc-kbd-text)',
      fontFamily: 'inherit', whiteSpace: 'nowrap',
    }}>
      {children}
    </kbd>
  );
}

function Shortcut({ keys, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ fontSize: 11, color: 'var(--sc-label)', opacity: 0.6 }}>+</span>}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
      {label && <span style={{ fontSize: 11, color: 'var(--sc-label)', marginLeft: 3 }}>{label}</span>}
    </span>
  );
}

function ShortcutBar() {
  const sessionId = useStore(s => s.sessionId);
  const selectedIndex = useStore(s => s.selectedIndex);
  const detail = useStore(s => s.detail);
  const filter = useStore(s => s.filter);
  const hasFilters = filter.search || filter.files?.length || filter.level?.length || filter.from || filter.to;

  const groups = [];

  if (detail) {
    groups.push([{ keys: ['Esc'], label: 'close' }]);
  } else if (sessionId) {
    if (selectedIndex >= 0) {
      groups.push([
        { keys: ['Enter'], label: 'open detail' },
        { keys: ['e'], label: 'expand row' },
      ]);
    }
    groups.push([
      { keys: ['↑'], label: '' },
      { keys: ['↓'], label: 'navigate' },
    ]);
    groups.push([{ keys: ['/'], label: 'search' }]);
    if (hasFilters) groups.push([{ keys: ['Esc'], label: 'clear filters' }]);
  }

  if (groups.length === 0) return null;

  return (
    <div className="shortcut-bar-root">
      {groups.map((g, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <span style={{ width: 1, height: 14, background: 'var(--sc-divider)', display: 'inline-block' }} />}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {g.map((s, si) => <Shortcut key={si} keys={s.keys} label={s.label} />)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
