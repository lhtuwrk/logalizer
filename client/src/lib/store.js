import { create } from 'zustand';
import { api } from './api.js';

const initialFilter = { level: [], files: [], search: '', from: null, to: null, sort: 'time-asc' };
const PAGE_SIZE = 1000;

export const useStore = create((set, get) => ({
  sessionId: null,
  summary: null,
  files: [],
  recordCount: 0,
  records: [],
  recordsTotal: 0,
  loadingMore: false,
  filter: { ...initialFilter },
  loading: false,
  error: null,
  busyMessage: null,
  rightTab: 'insights', // insights | charts | report | monitor
  report: null,
  monitor: { active: false, lines: [], targets: [] },
  detail: null,            // { record, before, after } when a row is selected
  jumpRequest: 0,          // increments to ask LogViewer to scroll to selectedIndex
  selectedIndex: -1,

  setBusy: (msg) => set({ busyMessage: msg }),
  setError: (e) => set({ error: e }),
  setRightTab: (t) => set({ rightTab: t }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: { ...initialFilter } }),
  toggleFile: (name) => set((s) => {
    const cur = new Set(s.filter.files || []);
    if (cur.has(name)) cur.delete(name); else cur.add(name);
    return { filter: { ...s.filter, files: [...cur] } };
  }),

  loadSummary: async (sessionId, summary, files = [], recordCount = 0) => {
    set({ sessionId, summary, files, recordCount, error: null, report: null });
    await get().fetchRecords();
  },

  fetchRecords: async () => {
    const { sessionId, filter } = get();
    if (!sessionId) return;
    const q = {
      level: (filter.level || []).join(',') || undefined,
      files: (filter.files || []).join(',') || undefined,
      search: filter.search || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined,
      sort: filter.sort || undefined,
      offset: 0,
      limit: PAGE_SIZE,
    };
    set({ loading: true });
    try {
      const r = await api.getRecords(sessionId, q);
      set({ records: r.records, recordsTotal: r.total, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  loadMoreRecords: async () => {
    const { sessionId, filter, records, recordsTotal, loadingMore } = get();
    if (!sessionId || loadingMore || records.length >= recordsTotal) return;
    const q = {
      level: (filter.level || []).join(',') || undefined,
      files: (filter.files || []).join(',') || undefined,
      search: filter.search || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined,
      sort: filter.sort || undefined,
      offset: records.length,
      limit: PAGE_SIZE,
    };
    set({ loadingMore: true });
    try {
      const r = await api.getRecords(sessionId, q);
      set((s) => ({ records: [...s.records, ...r.records], recordsTotal: r.total, loadingMore: false }));
    } catch (e) {
      set({ error: e.message, loadingMore: false });
    }
  },

  openDetail: async (record) => {
    const { sessionId } = get();
    if (!sessionId || !record) return;
    set({ detail: { record, before: [], after: [], loading: true } });
    try {
      const r = await api.getContext(sessionId, record.file, record.lineNo, 8);
      set({ detail: { ...r, loading: false } });
    } catch (e) {
      set({ detail: { record, before: [], after: [], loading: false, error: e.message } });
    }
  },
  closeDetail: () => set({ detail: null }),

  jumpToFirstMatch: (search) => {
    const { records } = get();
    if (!search) return;
    let re;
    try { re = new RegExp(search, 'i'); } catch { re = null; }
    const idx = records.findIndex(r => re ? re.test(r.message) : (r.message || '').toLowerCase().includes(search.toLowerCase()));
    if (idx >= 0) set(s => ({ selectedIndex: idx, jumpRequest: s.jumpRequest + 1 }));
  },
  setSelectedIndex: (i) => set({ selectedIndex: i }),
  requestJump: (i) => set(s => ({ selectedIndex: i, jumpRequest: s.jumpRequest + 1 })),

  pasteAnalyze: async (text) => {
    set({ busyMessage: 'Parsing pasted logs…', error: null });
    try {
      const r = await api.pasteText(text);
      await get().loadSummary(r.sessionId, r.summary, [{ name: 'pasted.log', size: text.length }], r.recordCount);
    } catch (e) { set({ error: e.message }); }
    finally { set({ busyMessage: null }); }
  },

  uploadAnalyze: async (files) => {
    const { sessionId } = get();
    set({ busyMessage: `Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`, error: null });
    try {
      if (sessionId) {
        // Session already open — merge into it instead of replacing
        const r = await api.addFiles(sessionId, files);
        set({ summary: r.summary, files: r.files, recordCount: r.recordCount });
        await get().fetchRecords();
      } else {
        const r = await api.uploadFiles(files);
        await get().loadSummary(r.sessionId, r.summary, r.files, r.recordCount);
      }
    } catch (e) { set({ error: e.message }); }
    finally { set({ busyMessage: null }); }
  },

  removeFile: async (filename) => {
    const { sessionId } = get();
    if (!sessionId) return;
    set({ busyMessage: `Removing ${filename}…`, error: null });
    try {
      const r = await api.removeFile(sessionId, filename);
      // Drop from active file filter if it was selected
      const activeFiles = (get().filter.files || []).filter(f => f !== filename);
      set({ summary: r.summary, files: r.files, recordCount: r.recordCount,
            filter: { ...get().filter, files: activeFiles } });
      await get().fetchRecords();
    } catch (e) { set({ error: e.message }); }
    finally { set({ busyMessage: null }); }
  },

  folderAnalyze: async (folder) => {
    set({ busyMessage: `Scanning folder ${folder}…`, error: null });
    try {
      const r = await api.analyzeFolder(folder);
      await get().loadSummary(r.sessionId, r.summary, r.files, r.recordCount);
    } catch (e) { set({ error: e.message }); }
    finally { set({ busyMessage: null }); }
  },

  investigateSample: async () => {
    set({ busyMessage: 'Investigating sample folder…', error: null });
    try {
      const r = await api.investigateSample();
      await get().loadSummary(r.sessionId, r.report.summary, r.report.files, r.report.recordCount);
      set({ report: r.report, rightTab: 'report' });
    } catch (e) { set({ error: e.message }); }
    finally { set({ busyMessage: null }); }
  },

  investigateFolder: async (folder) => {
    set({ busyMessage: `Investigating ${folder}…`, error: null });
    try {
      const r = await api.investigate(folder);
      await get().loadSummary(r.sessionId, r.report.summary, r.report.files, r.report.recordCount);
      set({ report: r.report, rightTab: 'report' });
    } catch (e) { set({ error: e.message }); }
    finally { set({ busyMessage: null }); }
  },

  startMonitor: (target) => {
    const { monitor } = get();
    if (monitor.active && monitor.ws) try { monitor.ws.close(); } catch {}
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/monitor';
    const ws = new WebSocket(wsUrl);
    set({ monitor: { active: true, lines: [], targets: target.folder ? [target.folder] : target.files, ws } });
    ws.addEventListener('open', () => ws.send(JSON.stringify({ action: 'watch', ...target })));
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'records') {
          set((s) => ({ monitor: { ...s.monitor, lines: [...s.monitor.lines, ...msg.records].slice(-5000) } }));
        }
      } catch {}
    });
    ws.addEventListener('close', () => set((s) => ({ monitor: { ...s.monitor, active: false } })));
  },
  stopMonitor: () => {
    const { monitor } = get();
    if (monitor.ws) try { monitor.ws.send(JSON.stringify({ action: 'stop' })); monitor.ws.close(); } catch {}
    set({ monitor: { active: false, lines: [], targets: [] } });
  },
}));
