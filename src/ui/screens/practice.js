// Practice task (a): a grid of large targets. One target is highlighted;
// clicking it scores a hit and moves the highlight.
export function createPracticeScreen({ root, feedback, onScoreReset }) {
  const grid = root.querySelector('#target-grid');
  const scoreEl = root.querySelector('#score');
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  let score = 0;
  let goal = 4;

  const targets = labels.map((label, i) => {
    const b = document.createElement('button');
    b.className = 'target';
    b.id = `target-${label}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      if (i === goal) {
        score += 1;
        scoreEl.textContent = String(score);
        b.classList.add('done');
        setTimeout(() => b.classList.remove('done'), 600);
        feedback.toast(`Hit ${label}!`);
        pickGoal();
      } else {
        feedback.toast(`That was ${label}. Try the highlighted target.`, { kind: 'warn' });
      }
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const flagged = b.classList.toggle('flagged');
      b.textContent = flagged ? `${label} ⚑` : label;
      feedback.toast(`Right click on ${label}: ${flagged ? 'flagged' : 'flag removed'}`);
    });
    grid.appendChild(b);
    return b;
  });

  function pickGoal() {
    targets[goal].classList.remove('goal');
    let next = goal;
    while (next === goal) next = Math.floor(Math.random() * targets.length);
    goal = next;
    targets[goal].classList.add('goal');
    targets[goal].setAttribute('aria-label', `${labels[goal]} (highlighted target)`);
  }

  targets[goal].classList.add('goal');

  root.querySelector('#btn-reset-score').dataset.confirmText = 'Reset my score to 0?';
  root.querySelector('#btn-reset-score').addEventListener('click', () => {
    score = 0;
    scoreEl.textContent = '0';
    feedback.toast('Score reset');
    onScoreReset?.();
  });
}
