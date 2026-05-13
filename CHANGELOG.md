# Changelog

All notable changes to Logalizer are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versions follow [Semantic Versioning](https://semver.org/).

---
## [1.1.1]

## [1.1.0] — 2026-05-13
### Added

- **Custom log format builder** — when auto-detection produces mostly unknown records, a highlighted "Custom parser (recommended)" button appears in the sidebar. Opens a modal that loads sample lines from each file, lets you drag-select parts of a sample line, and tag spans as `timestamp`, `level`, `logger`, `thread`, `context`, or `message`. Generated regex and parsed preview update live; Apply & re-parse rebuilds the entire session in place without re-uploading
- **Format-specific parsers** — new chain of matchers layered ahead of the generic plain parser recognises out of the box: Rust `env_logger` / `tracing-subscriber`, Logback / Spring Boot, log4j / Java (two variants), Python `logging` (two variants), PostgreSQL, MySQL, nginx error log, Apache/nginx Combined access log, Heroku router, Kubernetes klog, Android Logcat, Syslog RFC 3164 & 5424, CEF, LEEF, Windows Event Log textual export, Go default log, and Docker JSON-File envelopes (inner line is re-parsed through the chain)
- **Richer JSON field aliases** — `levelname`, `log_level`, `thread_name`, `request_id`, `trace_id`, `spanId`, `eventTime`, `component`, `source`
- **Syslog severity mapping** — numeric `<PRI>` severity (`0`–`7`) normalised to `FATAL`…`DEBUG`; `PANIC` mapped to `FATAL`
- **Parser API endpoints** — `GET /api/sessions/:id/samples` returns first N raw lines per file; `POST /api/sessions/:id/reparse` applies a `{sample, spans}` spec to an existing session; `POST /api/parser/preview` is a stateless preview against one line

### Changed

- **Continuation detection** recognises CEF / LEEF / klog / Windows / syslog 5424 line openers in addition to timestamps, so multiline records no longer swallow the next entry when those formats are mixed in
- **Sessions retain raw file paths** (or the original pasted text) so a session can be re-parsed with a custom format spec without re-uploading; files are cleaned up when the session is deleted
- `parseStream` accepts a `customParser` option that bypasses format detection; unmatched lines fold into the previous record as continuations
- Timestamp patterns expanded with `[ISO …]` compound bracket and `dd/mm/yyyy` / `dd-mm-yyyy` shapes

### Fixed

- **Rust `env_logger` / `tracing` logs no longer collapse into a single record.** The bracketed-ISO timestamp pattern required `]` to immediately follow the timestamp, but lines like `[2026-05-06T08:01:36Z INFO  db_bridge]` keep the level and logger inside the same bracket — so `isContinuation` treated every line as a continuation and merged the whole file into one entry. Added a compound-bracket timestamp pattern and a Rust-format fast-path that extracts timestamp, level, and logger correctly
- Upload temp files are no longer deleted while the session is still active; retained for potential re-parsing and removed only when the session ends
- **Custom-parser modal: field buttons were disabled after releasing the mouse.** The drag-selection was cleared on `mouseUp`, so by the time you tried to click Time / Level / Logger the selection was already gone. Selection now persists after release until it's either tagged or replaced by a new drag
- **Right panel (Insights / Charts / Report) didn't scroll.** The right-panel wrapper missed `flex` on its container, so the inner `overflow-auto` had no bounded height and long error lists were clipped instead of scrolling

---
## [1.0.0] — 2026-05-07
### Added

- **Desktop app** — Electron 33 wrapper; runs as a native window on Windows, macOS, and Linux with no browser required
- **Log parser** — auto-detects format from the first 25 lines; supports plain text, JSON, logfmt, key=value, and multiline stack traces (Java / Python / JS / Go)
- **Archive support** — automatically extracts and parses `.zip`, `.gz`, `.tar.gz`, and `.tgz` files on drop or upload
- **Multi-file sessions** — drop additional files into an open session to merge them without losing previous data
- **Remove file** — remove individual files from an active session; summary and record list update immediately
- **Error clustering** — groups similar errors by fingerprint (UUIDs, IPs, numbers, timestamps stripped before comparison)
- **Anomaly detection** — flags log-rate spikes using mean + 3σ spike detection
- **Root-cause hints** — heuristic matching against top errors surfaces likely causes (network timeouts, OOM, deadlock, 5xx, etc.)
- **Timeline chart** — auto-bucketed log rate over time with per-level breakdown
- **Real-time monitor** — live-tail any file or folder via WebSocket with chokidar file watcher
- **Full-text search** — regex-aware search with inline validity indicator
- **Filters** — filter by level, file, and time range; combinable with search
- **Virtualized log viewer** — renders ~30 DOM nodes regardless of record count; handles 100k+ records smoothly
- **Detail drawer** — click any log line to see it in context (±N surrounding lines)
- **Export** — download filtered logs as JSON, CSV, or a printable HTML report
- **Dark / light mode** — toggled from the toolbar, persisted in localStorage
- **Custom app icon** — SVG source with generated `.ico`, `.icns`, `.png` for all platforms via `npm run generate-icons`
- **Animated empty state** — draw-in + floating animation on first load
- **Drag-and-drop** — global drop zone with overlay; works anywhere in the window

---

<!-- version links — kept below all sections so awk extraction doesn't include them -->
[1.0.0]: https://github.com/YOUR_USERNAME/logalizer/releases/tag/v1.0.0

[1.1.0]: https://github.com/lhtuwrk/logalizer/releases/tag/v1.1.0
