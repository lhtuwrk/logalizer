# Logalizer — Guidelines

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Setup

```bash
npm run install:all
```

### Run (web mode)

```bash
npm run dev
```

- API server: `http://localhost:5174`
- UI (Vite dev server): `http://localhost:5173`

### Run (desktop / Electron mode)

```bash
npm run dev:electron
```

Opens a native desktop window. The Express server and Vite dev server start automatically. Press **F12** inside the window to open DevTools.

---

## Release (desktop app)

### Build

```bash
npm run build:electron
```

This does two things in sequence:

1. Builds the React client (`client/dist/`)
2. Packages everything with electron-builder → `dist-electron/`

### Output

| Platform | File |
|----------|------|
| Windows  | `dist-electron/Logalizer Setup x.x.x.exe` (NSIS installer) |
| macOS    | `dist-electron/Logalizer-x.x.x.dmg` |
| Linux    | `dist-electron/Logalizer-x.x.x.AppImage` |

The packaged app is self-contained — it uses Electron's built-in Node.js to run the Express server. Users do not need Node.js installed.

### What gets bundled

| Source | Destination inside package |
|--------|---------------------------|
| `electron/main.mjs` | `resources/app/electron/` |
| `server/` + `server/node_modules/` | `resources/server/` |
| `client/dist/` | `resources/client/dist/` |

User uploads are stored in the OS app-data folder (not inside the package):

- Windows: `%APPDATA%\Logalizer\uploads\`
- macOS: `~/Library/Application Support/Logalizer/uploads/`
- Linux: `~/.config/Logalizer/uploads/`

---

## App icon

The source icon is `electron/icons/app-icon.svg`. All platform icon formats are generated from it automatically.

### Regenerate icons

After editing `app-icon.svg`, run:

```bash
npm run generate-icons
```

This produces:

| File | Used for |
|------|----------|
| `electron/icons/icon.ico` | Windows (multi-resolution: 16 – 256 px) |
| `electron/icons/icon.icns` | macOS (7 sizes up to 1024 px) |
| `electron/icons/icon.png` | Linux (512×512 px) |
| `electron/icons/icon-{size}.png` | Individual sizes for reference |

The icon takes effect immediately in the Electron window titlebar/taskbar (dev mode). It is baked into the installer automatically when you run `npm run build:electron`.

---

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install deps for root, server, and client |
| `npm run dev` | Start server + Vite (web mode) |
| `npm run dev:electron` | Start server + Vite + Electron window (desktop dev mode) |
| `npm run build` | Build React client only |
| `npm run build:electron` | Build client + package desktop installers |
| `npm run server` | Start API server only |
| `npm run client` | Start Vite dev server only |
| `npm run electron` | Launch Electron only (servers must already be running) |
| `npm run generate-icons` | Regenerate all icon formats from `electron/icons/app-icon.svg` |

---

## Releasing

After each release the workflow automatically prepends the next version section to `CHANGELOG.md` (e.g. `## [1.0.1]`). Add your notes there as you work.

1. Add your changes under the current pending version section in `CHANGELOG.md`:
   ```markdown
   ## [1.0.1]
   ### Fixed
   - Some bug fix
   ```
2. When ready to ship, commit and tag:
   ```bash
   git add CHANGELOG.md
   git commit -m "chore: release v1.0.1"
   git tag v1.0.1
   git push origin main v1.0.1
   ```

GitHub Actions then does everything else automatically:

| Job | What it does |
|-----|-------------|
| **build** | Runs on Windows, macOS, Linux in parallel; sets the version from the tag, builds the installer |
| **release** | Reads the `## [1.0.1]` section from `CHANGELOG.md`, uses it as the GitHub Release description, attaches all installers |
| **sync-version** | Stamps `## [1.0.1]` with today's date, prepends `## [1.0.2]` for the next cycle, bumps all `package.json` files to `1.0.2`, commits back to `main` |

**After the workflow completes, `CHANGELOG.md` on `main` looks like:**

```markdown
## [1.0.2]             ← ready for next changes

## [1.0.1] — 2026-06-01   ← stamped by the workflow
...your release notes...

## [1.0.0] — 2026-05-07
...
```

Pre-release tags (e.g. `v1.1.0-beta.1`) are marked as pre-release on GitHub automatically.
