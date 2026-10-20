// Shows which input is detected right now. Updates the DOM only on change.
export function createDetectionIndicator(root) {
  const face = root.querySelector('#ind-face');
  const click = root.querySelector('#ind-click');
  const clickFill = click.querySelector('.fill');
  const clickMark = click.querySelector('.mark');
  const clickName = click.querySelector('.ind-name');
  const eyes = root.querySelector('#ind-eyes');
  const eyesFill = eyes.querySelector('.fill');
  const hand = root.querySelector('#ind-hand');
  const prev = {};

  function set(key, value, apply) {
    if (prev[key] === value) return;
    prev[key] = value;
    apply(value);
  }

  return {
    update({ faceSeen, clickLevel, clickThreshold, clickFiring, clickLabel, eyesProgress, handEnabled, handKind }) {
      set('face', faceSeen, (v) => face.classList.toggle('on', v));
      set('clickLabel', clickLabel, (v) => (clickName.textContent = v));
      set('clickLevel', Math.round((clickLevel ?? 0) * 50), (v) => (clickFill.style.width = `${v * 2}%`));
      set('clickThr', clickThreshold, (v) => (clickMark.style.left = `${v * 100}%`));
      set('clickFiring', clickFiring, (v) => click.classList.toggle('firing', v));
      set('clickOn', (clickLevel ?? 0) > 0.05, (v) => click.classList.toggle('on', v));
      set('eyes', Math.round(eyesProgress * 20), (v) => (eyesFill.style.width = `${v * 5}%`));
      set('eyesOn', eyesProgress > 0, (v) => eyes.classList.toggle('firing', v));
      set('handEnabled', handEnabled, (v) => hand.classList.toggle('hidden', !v));
      set('hand', handKind ?? 'no hand', (v) => {
        hand.querySelector('.ind-name').textContent = `Hand: ${v === 'fist' ? 'fist' : v === 'palm' ? 'open palm' : v === 'none' ? 'seen' : 'not seen'}`;
        hand.classList.toggle('on', v !== 'no hand');
        hand.classList.toggle('firing', v === 'fist' || v === 'palm');
      });
    },
  };
}
