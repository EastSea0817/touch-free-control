// Practice task (c): a mock form with a high-risk "Delete my account" button.
const TOPICS = ['Local news', 'Sports', 'Health'];
const FREQS = ['Daily', 'Weekly', 'Monthly'];
const GOAL = { topic: 'Sports', freq: 'Weekly' };

export function createFormScreen({ root, feedback, onTaskDone }) {
  const task = root.querySelector('#form-task');
  const state = { topic: null, freq: null };

  function choices(container, options, key) {
    const buttons = options.map((label) => {
      const b = document.createElement('button');
      b.className = 'btn btn-choice';
      b.textContent = label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        state[key] = label;
        buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      container.appendChild(b);
      return b;
    });
    return buttons;
  }
  const topicButtons = choices(root.querySelector('#form-topic'), TOPICS, 'topic');
  const freqButtons = choices(root.querySelector('#form-freq'), FREQS, 'freq');

  root.querySelector('#form-save').addEventListener('click', () => {
    if (!state.topic || !state.freq) {
      feedback.toast('Please choose a topic and how often first.', { kind: 'warn' });
      return;
    }
    feedback.toast(`Saved: ${state.topic}, ${state.freq}`);
    if (state.topic === GOAL.topic && state.freq === GOAL.freq) {
      task.textContent = 'Task done! You saved Sports, Weekly, and did not delete your account.';
      task.classList.add('done');
      onTaskDone?.('form');
    }
  });

  const del = root.querySelector('#form-delete');
  del.dataset.confirmText = 'Delete my account? (Practice only: nothing real is deleted.)';
  del.addEventListener('click', () => {
    feedback.toast('Practice account deleted. In real life this could not be undone.', { kind: 'warn', ms: 3000 });
    reset();
  });

  function reset() {
    state.topic = null;
    state.freq = null;
    [...topicButtons, ...freqButtons].forEach((b) => b.setAttribute('aria-pressed', 'false'));
    task.textContent = `Task: choose "${GOAL.topic}" and "${GOAL.freq}", then press Save. Do not delete the account.`;
    task.classList.remove('done');
  }

  return { reset };
}
