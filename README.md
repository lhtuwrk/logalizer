# Logalizer

> Desktop log analyzer — drop any log file and instantly surface errors, anomalies, tracing, and root-cause hints.

---

## Features

- **Any format** — auto-detects plain text, JSON, logfmt, key=value, and multiline stack traces (Java / Python / JS / Go)
- **Any size** — streaming parser handles 100 MB+ files; virtualized rendering keeps the UI smooth at 100k+ records
- **Archive support** — automatically extracts and parses `.zip`, `.gz`, `.tar.gz`, `.tgz`
- **Error clustering** — groups similar errors by fingerprint, stripping volatile parts (UUIDs, IPs, numbers, timestamps)
- **Anomaly detection** — flags log-rate spikes using mean + 3σ detection
- **Root-cause hints** — heuristic matching against top errors surfaces likely causes (network, OOM, deadlock, 5xx, etc.)
- **Real-time monitor** — live-tail any file or folder via WebSocket
- **Multi-file sessions** — drop additional files into an open session to merge them; remove individual files without reloading
- **Export** — download filtered logs as JSON, CSV, or a printable HTML report
- **Dark / light mode** — persisted across sessions

---

## Installation

Download the latest installer for your platform from the [Releases](../../releases) page.

| Platform | File |
|----------|------|
| Windows  | `Logalizer-Setup-x.x.x.exe` |
| macOS    | `Logalizer-x.x.x.dmg` |
| Linux    | `Logalizer-x.x.x.AppImage` |

No runtime dependencies required — the app is fully self-contained.

---

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Setup

```bash
git clone <repo-url>
cd logalizer
npm run install:all
```

### Run (desktop)

```bash
npm run dev:electron
```

Opens a native desktop window. The API server and Vite dev server start automatically.
Press **F12** to open DevTools.

### Run (browser)

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| UI | `http://localhost:5173` |
| API | `http://localhost:5174` |

---

## Build & release

```bash
# Build installer
npm run build:electron
# → dist-electron/Logalizer-Setup-x.x.x.exe  (Windows)
# → dist-electron/Logalizer-x.x.x.dmg        (macOS)
# → dist-electron/Logalizer-x.x.x.AppImage   (Linux)
```

See [GUIDELINES.md](GUIDELINES.md) for the full release workflow and [CHANGELOG.md](CHANGELOG.md) for version history.

---

## API reference

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sessions/text` | Analyze pasted text |
| `POST` | `/api/sessions/upload` | Analyze uploaded files (multipart) |
| `POST` | `/api/sessions/folder` | Analyze a server-side folder path |
| `POST` | `/api/sessions/:id/add-files` | Merge additional files into an existing session |
| `DELETE` | `/api/sessions/:id/files?file=name` | Remove a file from a session |
| `POST` | `/api/investigate` | Deep-investigate a folder (full report) |
| `GET` | `/api/sessions/:id` | Session summary |
| `GET` | `/api/sessions/:id/records` | Filtered + paginated records |
| `GET` | `/api/sessions/:id/export.json\|csv\|html` | Export |
| `WS` | `/ws/monitor` | Live-tail files or folders |

---

## Project structure

```
logalizer/
├── electron/              # Electron main process
│   └── icons/             # App icons (ico, icns, png) + source SVG
├── client/                # React + Vite + Tailwind frontend
│   └── src/
│       ├── components/    # UI components
│       └── lib/           # Zustand store, API client
├── server/                # Node.js + Express backend
│   └── src/
│       └── lib/
│           ├── parser.js       # Auto-detect + streaming log parser
│           ├── analyzer.js     # Aggregator, fingerprinting, anomaly detection
│           ├── investigator.js # Folder scan → structured report
│           ├── streaming.js    # readline / gzip line iterators
│           ├── sessions.js     # In-memory session store
│           └── export.js       # JSON / CSV / HTML export
├── generate-icons.js      # Regenerate app icons from SVG
└── GUIDELINES.md          # Development & release guidelines
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 33 |
| Frontend | React 18, Vite 5, Tailwind CSS, Zustand |
| Charts | Recharts |
| Virtualized list | react-window |
| Backend | Node.js 20, Express 4 |
| Real-time | WebSocket (`ws`), chokidar |
| Archive parsing | AdmZip (zip), zlib (gz), tar (tar.gz) |
| Packaging | electron-builder |

---

## License

MIT
