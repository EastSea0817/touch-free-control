// Desktop app (Electron). Same camera + input engine as the web prototype,
// but the cursor is the REAL Windows mouse, so it works in every program.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, screen, globalShortcut, session, protocol, net } = require('electron');
const mouse = require('./mouse.cjs');

let win = null;
const DIST = path.join(__dirname, '..', 'dist');

// The built pages are served as app://local/... (a secure origin), so the
// camera works and MediaPipe can fetch its bundled wasm/model files.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Engine works in DIP (CSS pixels); SetCursorPos wants physical pixels.
function toPhysical(x, y) {
  if (process.platform === 'win32' && screen.dipToScreenPoint) return screen.dipToScreenPoint({ x, y });
  return { x, y };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 640,
    backgroundColor: '#f3f5f9',
    title: 'Touch-free Control',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep tracking while other apps are in front
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/desktop.html`);
  else win.loadURL('app://local/desktop.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const file = path.normalize(path.join(DIST, decodeURIComponent(new URL(req.url).pathname)));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Camera only; every other permission is refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(permission === 'media' && (details.mediaTypes ?? []).every((t) => t === 'video'));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  ipcMain.handle('screen:get', () => {
    const d = screen.getPrimaryDisplay();
    return { width: d.bounds.width, height: d.bounds.height, x: d.bounds.x, y: d.bounds.y };
  });
  ipcMain.handle('mouse:supported', () => mouse.supported);
  ipcMain.on('mouse:move', (_e, x, y) => {
    const p = toPhysical(x, y);
    mouse.move(p.x, p.y);
  });
  ipcMain.handle('mouse:click', (_e, button, x, y) => {
    if (typeof x === 'number') {
      const p = toPhysical(x, y);
      mouse.move(p.x, p.y);
    }
    return mouse.click(button === 'right' ? 'right' : 'left');
  });

  // Calibration needs the whole screen (dots in the four corners).
  ipcMain.handle('window:fullscreen', (_e, on) => {
    win?.setFullScreen(!!on);
    return !!on;
  });

  // Keyboard shortcuts for a caregiver: pause/resume and re-center.
  globalShortcut.register('CommandOrControl+Alt+P', () => win?.webContents.send('shortcut', 'togglePause'));
  globalShortcut.register('CommandOrControl+Alt+C', () => win?.webContents.send('shortcut', 'recenter'));

  createWindow();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
