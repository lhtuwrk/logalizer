// In-memory session store. Each session holds the fully-parsed records and aggregator
// so the client can run filter/search/export without re-uploading.
import { randomUUID } from 'crypto';

const sessions = new Map();

export function createSession({ source, files, records, aggregator }) {
  const id = randomUUID();
  sessions.set(id, {
    id,
    source,
    files: files || [],
    records,
    aggregator,
    createdAt: Date.now(),
  });
  return id;
}

export function getSession(id) {
  return sessions.get(id);
}

export function deleteSession(id) {
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
