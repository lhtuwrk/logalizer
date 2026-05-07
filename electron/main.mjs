import { app, BrowserWindow, Menu, nativeImage, shell } from 'electron';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const PORT = 5174;

let mainWindow = null;

// Poll until an HTTP endpoint responds (used to wait for dev servers or embedded server)
function waitForHttp(url, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      http.get(url, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${url}`));
          setTimeout(attempt, 300);
        });
    }
    attempt();
  });
}

// Start the embedded Express server via dynamic import (production only)
async function startEmbeddedServer() {
  const serverEntry = path.join(process.resourcesPath, 'server', 'src', 'index.js');

  // Tell the server not to auto-start (we call start() ourselves)
  process.env.ELECTRON = '1';
  process.env.PORT = String(PORT);
  // Redirect uploads to user-writable app data folder
  process.env.UPLOAD_DIR = path.join(app.getPath('userData'), 'uploads');

  const { start } = await import(pathToFileURL(serverEntry).href);
  await start(PORT);
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icons', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Logalizer',
    icon: iconPath,
    backgroundColor: '#111827',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove default menu on Windows/Linux for a cleaner desktop feel
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  const url = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`;
  mainWindow.loadURL(url);

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // F12 opens DevTools in dev
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  if (isDev) {
    // Dev: server + Vite are started externally by `npm run dev:electron`
    // Wait for Vite to be ready before opening the window
    await waitForHttp('http://localhost:5173').catch(() => {});
  } else {
    // Production: start the embedded Express server, then open the window
    await startEmbeddedServer();
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
