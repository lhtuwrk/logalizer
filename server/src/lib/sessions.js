// In-memory session store. Each session holds the fully-parsed records and aggregator
// so the client can run filter/search/export without re-uploading.
import { randomUUID } from 'crypto';
import fs from 'fs';

const sessions = new Map();

export function createSession({ source, files, records, aggregator, rawFiles = [], customParser = null }) {
  const id = randomUUID();
  sessions.set(id, {
    id,
    source,
    files: files || [],
    rawFiles,          // [{ name, path?, gz?, text? }] — used to re-parse with a custom format
    records,
    aggregator,
    customParser,      // remembered custom parser spec (for display)
    createdAt: Date.now(),
  });
  return id;
}

export function getSession(id) {
  return sessions.get(id);
}

export function deleteSession(id) {
  const s = sessions.get(id);
  if (s?.rawFiles) {
    for (const f of s.rawFiles) {
      if (f.path && f.persistOnDelete !== false) {
        try { fs.unlinkSync(f.path); } catch {}
      }
    }
  }
  return sessions.delete(id);
}

export function listSessions() {
  return [...sessions.values()].map(s => ({
    id: s.id,
    source: s.source,
    fileCount: s.files.length,
    recordCount: s.records.length,
    createdAt: s.createdAt,
  }));
}
