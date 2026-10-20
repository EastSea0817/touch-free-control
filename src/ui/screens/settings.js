// Settings ("rules") screen: every value has big − / + or toggle buttons.
import { SETTING_SPECS, formatSetting, stepSetting } from '../../core/settings.js';

export function createSettingsScreen({ root, app }) {
  const list = root.querySelector('#settings-list');
  const valueEls = {};

  for (const spec of SETTING_SPECS) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = spec.label;
    row.appendChild(name);
    const value = document.createElement('span');
    value.className = 'value';
    valueEls[spec.key] = value;

    if (spec.type === 'bool' || spec.type === 'choice') {
      row.appendChild(value);
      const b = document.createElement('button');
      b.className = 'btn btn-wide';
      b.textContent = spec.type === 'bool' ? 'Turn on/off' : 'Change';
      b.addEventListener('click', () => change(spec.key, 1));
      row.appendChild(b);
    } else {
      const minus = document.createElement('button');
      minus.className = 'btn';
      minus.textContent = '−';
      minus.setAttribute('aria-label', `Less ${spec.label}`);
      minus.addEventListener('click', () => change(spec.key, -1));
      const plus = document.createElement('button');
      plus.className = 'btn';
      plus.textContent = '+';
      plus.setAttribute('aria-label', `More ${spec.label}`);
      plus.addEventListener('click', () => change(spec.key, 1));
      row.append(minus, value, plus);
    }
    list.appendChild(row);
  }

  async function change(key, dir) {
    if (key === 'handEnabled') {
      await app.setHandEnabled(!app.settings.handEnabled);
    } else {
      const next = stepSetting(app.settings, key, dir);
      app.updateSettings(next);
    }
    render();
  }

  function render() {
    for (const spec of SETTING_SPECS) valueEls[spec.key].textContent = formatSetting(spec, app.settings[spec.key]);
  }

  root.querySelector('#settings-calibrate').addEventListener('click', () => app.startCalibration());
  root.querySelector('#settings-reset').dataset.confirmText = 'Reset all my settings and my calibration?';
  root.querySelector('#settings-reset').addEventListener('click', () => {
    app.resetProfile();
    render();
  });

  return { render };
}
