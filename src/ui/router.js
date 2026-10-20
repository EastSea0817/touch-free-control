// Shows one screen at a time. Screens are <section id="screen-NAME">.
export function createRouter(onShow) {
  let current = null;
  return {
    go(name) {
      for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== `screen-${name}`);
      current = name;
      window.scrollTo(0, 0);
      onShow?.(name);
    },
    get current() {
      return current;
    },
  };
}
