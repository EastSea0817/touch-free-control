// Moves and clicks the REAL Windows mouse through user32.dll (via koffi, no
// compiler needed). On other systems it only logs, so the app still opens
// for development.

const isWindows = process.platform === 'win32';

let api = null;
if (isWindows) {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  api = {
    SetCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
    mouse_event: user32.func('void __stdcall mouse_event(uint32 flags, uint32 dx, uint32 dy, uint32 data, uintptr extra)'),
  };
}

const FLAGS = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
};

function move(x, y) {
  if (!api) return false;
  return api.SetCursorPos(Math.round(x), Math.round(y));
}

function click(button = 'left') {
  const f = FLAGS[button] || FLAGS.left;
  if (!api) {
    console.log(`[mouse] ${button} click (not Windows, ignored)`);
    return false;
  }
  api.mouse_event(f.down, 0, 0, 0, 0);
  api.mouse_event(f.up, 0, 0, 0, 0);
  return true;
}

module.exports = { move, click, supported: isWindows };
