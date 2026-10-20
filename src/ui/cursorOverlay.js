// The virtual cursor: a DOM element moved with transform (cheap, no canvas redraw).
const RING_LEN = 2 * Math.PI * 30;

export function createCursorOverlay(el) {
  const ring = el.querySelector('#dwell-ring');
  let lastDwell = -1;
  let clickTimer = null;
  return {
    show(visible) {
      el.classList.toggle('hidden', !visible);
    },
    move(p) {
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    },
    setDwell(progress) {
      const q = Math.round(progress * 50) / 50;
      if (q === lastDwell) return;
      lastDwell = q;
      ring.style.strokeDashoffset = String(RING_LEN * (1 - q));
    },
    setPaused(paused) {
      el.classList.toggle('paused', paused);
    },
    pulse() {
      el.classList.add('clicking');
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => el.classList.remove('clicking'), 250);
    },
  };
}
