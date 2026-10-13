/* Electron main process: a small frameless window you drag anywhere.
 * Remembers its position/size, can launch at Windows startup, forwards
 * wake/unlock events to the clock and offers a right-click menu. */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, powerMonitor, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_SIZE = { width: 460, height: 240 };
const argValue = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

// ---- settings store (one JSON file in %APPDATA%\Sketch Clock) -------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let store = {};
let lastWritten = '';

function loadStore() {
  try {
    store = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {};
  } catch {
    store = {};
  }
}

function saveStore() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    lastWritten = JSON.stringify(store, null, 2);
    const tmp = settingsFile() + '.tmp';
    fs.writeFileSync(tmp, lastWritten);
    fs.renameSync(tmp, settingsFile());
  } catch (e) {
    console.error('Could not save settings:', e);
  }
}

// Pick up hand edits to settings.json without a restart.
function watchStore(win) {
  fs.watchFile(settingsFile(), { interval: 2000 }, () => {
    let text;
    try { text = fs.readFileSync(settingsFile(), 'utf8'); } catch { return; }
    if (text === lastWritten) return;
    try {
      store = JSON.parse(text);
      lastWritten = text;
      if (!win.isDestroyed()) win.webContents.send('settings:changed', store);
    } catch {
      // Ignore half-saved / invalid JSON; the next valid save is applied.
    }
  });
}

// ---- launch at startup ----------------------------------------------------
function applyLoginItem(enabled) {
  const opts = { openAtLogin: enabled };
  if (!app.isPackaged) {
    opts.path = process.execPath;
    opts.args = [path.resolve(app.getAppPath())];
  }
  app.setLoginItemSettings(opts);
}

// ---- window bounds --------------------------------------------------------
function restoredBounds() {
  const b = store.window;
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return { ...DEFAULT_SIZE };
  // Only reuse the position if it is still on a connected display.
  const visible = screen.getAllDisplays().some(({ workArea: w }) =>
    b.x + b.width - 60 > w.x && b.x + 60 < w.x + w.width && b.y + 20 > w.y - 20 && b.y + 40 < w.y + w.height);
  return visible ? b : { width: b.width, height: b.height };
}

let win = null;

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Redraw now', click: () => win.webContents.send('clock:redraw') },
    {
      label: 'Pause animation',
      type: 'checkbox',
      checked: !!store.animationPaused,
      click: (item) => {
        store.animationPaused = item.checked;
        saveStore();
        win.webContents.send('clock:set-paused', item.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Launch at Windows startup',
      type: 'checkbox',
      checked: app.getLoginItemSettings(app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(app.getAppPath())] }).openAtLogin,
      click: (item) => {
        store.launchAtStartup = item.checked;
        saveStore();
        applyLoginItem(item.checked);
      },
    },
    { label: 'Open settings file', click: () => { saveStore(); shell.openPath(settingsFile()); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createWindow() {
  const bounds = restoredBounds();
  const captureSize = /^(\d+)x(\d+)$/.exec(argValue('capture-size') || '');
  if (captureSize) Object.assign(bounds, { width: Number(captureSize[1]), height: Number(captureSize[2]) });
  win = new BrowserWindow({
    ...bounds,
    minWidth: 200,
    minHeight: 110,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Sketch Clock',
    backgroundColor: typeof store.paperColor === 'string' ? store.paperColor : '#dddbd4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const query = {};
  const at = argValue('at');
  if (at) query.at = at;
  win.loadFile(path.join(__dirname, 'src', 'index.html'), { query });
  win.once('ready-to-show', () => win.show());

  // The whole window is a drag region, so right-clicks arrive as a system menu request.
  win.on('system-context-menu', (event) => {
    event.preventDefault();
    buildMenu().popup({ window: win });
  });

  let saveTimer = null;
  const rememberBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return;
      store.window = win.getBounds();
      saveStore();
    }, 400);
  };
  win.on('move', rememberBounds);
  win.on('resize', rememberBounds);
  win.on('close', () => {
    if (!win.isMinimized()) store.window = win.getBounds();
    saveStore();
  });

  watchStore(win);

  // Test hook: --capture=out.png [--capture-delay=ms] saves a screenshot and quits.
  const capture = argValue('capture');
  if (capture) {
    const delay = Number(argValue('capture-delay')) || 6000;
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.resolve(capture), image.toPNG());
        app.quit();
      }, delay);
    });
  }
}

// Capture runs use a throwaway profile, so they never touch your settings
// and can run while your own clock is open.
if (argValue('capture')) app.setPath('userData', path.join(app.getPath('temp'), 'sketch-clock-capture'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.sketchclock.app');
    Menu.setApplicationMenu(null);
    loadStore();

    // First run of the installed app: register to start with Windows (can be
    // turned off from the right-click menu). Dev runs never self-register.
    if (app.isPackaged && store.launchAtStartup === undefined && !process.argv.includes('--no-autostart')) {
      store.launchAtStartup = true;
      applyLoginItem(true);
      saveStore();
    }

    ipcMain.handle('settings:get', () => store);
    ipcMain.handle('settings:save', (_e, patch) => {
      if (patch && typeof patch === 'object') {
        Object.assign(store, patch);
        saveStore();
      }
      return true;
    });
    ipcMain.on('menu:show', () => buildMenu().popup({ window: win }));

    const resync = () => win && !win.isDestroyed() && win.webContents.send('clock:resync');
    powerMonitor.on('resume', resync);
    powerMonitor.on('unlock-screen', resync);

    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
