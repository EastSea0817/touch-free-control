// Toasts, click highlight and optional click sounds (Web Audio tone, no TTS).
export function createFeedback(toastRoot) {
  let audio = null;
  let muted = false;

  function ensureAudio() {
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audio = new Ctx();
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }

  return {
    toast(text, { kind = 'info', ms = 1800 } = {}) {
      const el = document.createElement('div');
      el.className = `toast ${kind === 'warn' ? 'warn' : ''}`;
      el.textContent = text;
      toastRoot.appendChild(el);
      while (toastRoot.children.length > 3) toastRoot.firstChild.remove();
      setTimeout(() => el.remove(), ms);
    },
    highlight(el) {
      if (!el) return;
      el.classList.add('tfc-clicked');
      setTimeout(() => el.classList.remove('tfc-clicked'), 450);
    },
    /** Call on the first real user gesture so the browser allows sound. */
    unlockAudio() {
      if (!muted) ensureAudio();
    },
    beep(kind = 'click') {
      if (muted) return;
      const ctx = ensureAudio();
      if (!ctx || ctx.state !== 'running') return;
      const freq = { click: 880, right: 740, pause: 330, resume: 660, confirm: 520, cancel: 260 }[kind] ?? 600;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    },
    setMuted(m) {
      muted = m;
    },
    get muted() {
      return muted;
    },
  };
}
