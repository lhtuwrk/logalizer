const base = '';

async function jfetch(url, opts = {}) {
  const r = await fetch(base + url, opts);
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  health: () => jfetch('/api/health'),
  pasteText: (text) => jfetch('/api/sessions/text', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
  }),
  uploadFiles: async (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const r = await fetch('/api/sessions/upload', { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    return r.json();
  },
  addFiles: async (sessionId, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const r = await fetch(`/api/sessions/${sessionId}/add-files`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    return r.json();
  },
  removeFile: (sessionId, filename) =>
    jfetch(`/api/sessions/${sessionId}/files?file=${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  analyzeFolder: (folder) => jfetch('/api/sessions/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  }),
  investigateSample: () => jfetch('/api/investigate-sample', { method: 'POST' }),
  investigate: (folder) => jfetch('/api/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  }),
  getSession: (id) => jfetch(`/api/sessions/${id}`),
  getRecords: (id, q = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '') sp.set(k, v);
    return jfetch(`/api/sessions/${id}/records?${sp.toString()}`);
  },
  getContext: (id, file, lineNo, radius = 5) => {
    const sp = new URLSearchParams({ file, lineNo, radius });
    return jfetch(`/api/sessions/${id}/context?${sp.toString()}`);
  },
  getSamples: (id, perFile = 20) => jfetch(`/api/sessions/${id}/samples?perFile=${perFile}`),
  reparse: (id, spec) => jfetch(`/api/sessions/${id}/reparse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  }),
  previewParser: (spec) => jfetch('/api/parser/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  }),
  exportUrl: (id, fmt, q = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '') sp.set(k, v);
    return `/api/sessions/${id}/export.${fmt}?${sp.toString()}`;
  },
};
