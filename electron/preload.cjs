// The only bridge between the page and the system. The page can move/click
// the mouse and read the screen size; nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getScreen: () => ipcRenderer.invoke('screen:get'),
  moveMouse: (x, y) => ipcRenderer.send('mouse:move', x, y),
  click: (button, x, y) => ipcRenderer.invoke('mouse:click', button, x, y),
  onShortcut: (fn) => ipcRenderer.on('shortcut', (_e, name) => fn(name)),
  setFullScreen: (on) => ipcRenderer.invoke('window:fullscreen', on),
  mouseSupported: () => ipcRenderer.invoke('mouse:supported'),
});
