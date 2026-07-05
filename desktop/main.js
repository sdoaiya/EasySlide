const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const { pathToFileURL } = require('url');

let mainWindow;
let backendProcess;
let tray;
let isQuitting = false;

const BACKEND_PORT = 5011;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getUserDataDirs() {
  const portableRoot = app.isPackaged ? path.dirname(process.execPath) : null;
  const root = portableRoot && fs.existsSync(path.join(portableRoot, 'portable.flag'))
    ? path.join(portableRoot, 'EasySlideData')
    : app.getPath('userData');
  return {
    root,
    databasePath: path.join(root, 'data', 'database.db'),
    uploadsDir: path.join(root, 'uploads'),
    exportsDir: path.join(root, 'exports'),
  };
}

function startBackend() {
  const dirs = getUserDataDirs();
  ensureDir(path.dirname(dirs.databasePath));
  ensureDir(dirs.uploadsDir);
  ensureDir(dirs.exportsDir);

  const backendBinary = process.platform === 'win32' ? 'easyslide-backend.exe' : 'easyslide-backend';
  const backendEntry = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', backendBinary)
    : path.join(__dirname, '..', 'backend', 'app.py');

  const python = app.isPackaged ? backendEntry : (process.env.PYTHON || 'python');
  const args = app.isPackaged ? [] : [backendEntry];
  const env = {
    ...process.env,
    FLASK_ENV: 'production',
    BACKEND_PORT: String(BACKEND_PORT),
    DATABASE_PATH: dirs.databasePath,
    UPLOAD_FOLDER: dirs.uploadsDir,
    EXPORT_FOLDER: dirs.exportsDir,
    CORS_ORIGINS: `http://127.0.0.1:${BACKEND_PORT}`,
  };

  backendProcess = spawn(python, args, {
    cwd: path.dirname(backendEntry),
    env,
    windowsHide: true,
    stdio: 'ignore',
  });

  backendProcess.on('exit', () => {
    backendProcess = null;
  });
}

function waitForBackend(retries = 60) {
  return new Promise((resolve, reject) => {
    const ping = (attempt) => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (attempt <= 0) {
          reject(new Error('backend not ready'));
          return;
        }
        setTimeout(() => ping(attempt - 1), 500);
      });
      req.on('error', () => {
        if (attempt <= 0) {
          reject(new Error('backend not ready'));
          return;
        }
        setTimeout(() => ping(attempt - 1), 500);
      });
    };
    ping(retries);
  });
}

function stopBackend() {
  if (!backendProcess) {
    return;
  }

  const pid = backendProcess.pid;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }

  backendProcess.kill();
}

function isNewerVersion(current, latest) {
  const parse = (value) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [cMajor, cMinor, cPatch] = parse(current);
  const [lMajor, lMinor, lPatch] = parse(latest);
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'frontend', 'public', 'logo-nav.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: iconPath,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const frontendUrl = app.isPackaged
    ? pathToFileURL(path.join(process.resourcesPath, 'frontend', 'index.html')).toString()
    : 'http://127.0.0.1:3011';

  mainWindow.loadURL(frontendUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'frontend', 'public', 'logo-nav.png');

  tray = new (require('electron').Tray)(iconPath);
  tray.setToolTip('EasySlide');
  tray.setContextMenu(require('electron').Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

app.whenReady().then(async () => {
  startBackend();
  await waitForBackend();
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

ipcMain.handle('get-backend-port', () => BACKEND_PORT);
ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));
ipcMain.handle('open-data-dir', async () => {
  const dirs = getUserDataDirs();
  ensureDir(dirs.root);
  return shell.openPath(dirs.root);
});
ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return;
  }
  mainWindow.maximize();
});
ipcMain.handle('window-close', () => mainWindow?.close());
ipcMain.handle('check-for-updates', async () => {
  try {
    const response = await fetch('https://api.github.com/repos/Anionex/banana-slides/releases/latest', {
      headers: {
        'User-Agent': `EasySlide/${app.getVersion()}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const release = await response.json();
    const latestVersion = String(release.tag_name || '').replace(/^v/, '');
    const currentVersion = app.getVersion();

    if (!latestVersion || !isNewerVersion(currentVersion, latestVersion)) {
      return null;
    }

    return {
      version: latestVersion,
      url: String(release.html_url || 'https://github.com/Anionex/banana-slides/releases/latest'),
      notes: String(release.body || ''),
    };
  } catch {
    return null;
  }
});
