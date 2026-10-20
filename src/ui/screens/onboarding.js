// Start-up guide: privacy -> camera check -> choose how to click.
// Every step works with the virtual cursor (dwell is on by default).

// Face width in units of the video height: about 0.25-0.6 at a normal laptop distance.
const FACE_MIN = 0.22;
const FACE_MAX = 0.75;

export function cameraCheck(frame) {
  const face = frame?.face;
  if (!face) return { face: false, distance: null, center: null };
  const w = face.pose.faceWidth;
  const distance = w < FACE_MIN ? 'far' : w > FACE_MAX ? 'near' : 'ok';
  const nose = face.landmarks?.[1];
  const center = nose ? Math.abs(nose.x - 0.5) < 0.2 && Math.abs(nose.y - 0.5) < 0.25 : null;
  return { face: true, distance, center };
}

export function createOnboarding({ root, app }) {
  const steps = [...root.querySelectorAll('.onb-step')];
  let step = 1;

  function show(n) {
    step = n;
    steps.forEach((s) => s.classList.toggle('hidden', Number(s.dataset.step) !== n));
    render();
  }

  function render() {
    const s = app.settings;
    root.querySelectorAll('[data-gesture]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gesture === s.faceClickGesture)));
    root.querySelector('#onb-dwell').textContent = `Hold-still (dwell) click: ${s.dwellEnabled ? 'on' : 'off'}`;
    root.querySelector('#onb-hand').textContent = `Hand gestures: ${s.handEnabled ? 'on' : 'off'}`;
  }

  root.querySelectorAll('[data-onb-next]').forEach((b) => b.addEventListener('click', () => show(Math.min(3, step + 1))));
  root.querySelectorAll('[data-onb-back]').forEach((b) => b.addEventListener('click', () => show(Math.max(1, step - 1))));
  root.querySelectorAll('[data-gesture]').forEach((b) =>
    b.addEventListener('click', () => {
      app.updateSettings({ faceClickGesture: b.dataset.gesture });
      render();
    }),
  );
  root.querySelector('#onb-dwell').addEventListener('click', () => {
    app.updateSettings({ dwellEnabled: !app.settings.dwellEnabled });
    render();
  });
  root.querySelector('#onb-hand').addEventListener('click', async () => {
    await app.setHandEnabled(!app.settings.handEnabled);
    render();
  });
  root.querySelector('#onb-calibrate').addEventListener('click', () => {
    app.finishOnboarding();
    app.startCalibration();
  });
  root.querySelector('#onb-skip').addEventListener('click', () => app.finishOnboarding());

  const marks = {
    face: root.querySelector('#chk-face'),
    distance: root.querySelector('#chk-distance'),
    center: root.querySelector('#chk-center'),
  };
  let lastKey = '';
  function setCheck(el, ok, text) {
    el.className = ok === null ? '' : ok ? 'ok' : 'bad';
    el.querySelector('.mark').textContent = ok === null ? '…' : ok ? '✓' : '✗';
    if (text) el.lastChild.textContent = ` ${text}`;
  }

  return {
    start() {
      show(1);
    },
    /** called every frame while the guide is open */
    update(frame) {
      if (step !== 2) return;
      const c = cameraCheck(frame);
      const key = JSON.stringify(c);
      if (key === lastKey) return;
      lastKey = key;
      setCheck(marks.face, c.face, c.face ? 'I can see your face' : 'I cannot see your face yet');
      setCheck(
        marks.distance,
        c.distance === null ? null : c.distance === 'ok',
        c.distance === 'far' ? 'Please move a little closer' : c.distance === 'near' ? 'Please move a little farther back' : 'Your distance from the camera is good',
      );
      setCheck(marks.center, c.center, c.center === false ? 'Please move toward the middle of the camera view' : 'Your face is near the middle of the camera view');
    },
    render,
  };
}
