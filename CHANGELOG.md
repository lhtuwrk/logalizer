# Changelog

All notable changes to Logalizer are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versions follow [Semantic Versioning](https://semver.org/).

---
## [1.0.1]

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
