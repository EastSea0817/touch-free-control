// Practice task (b): a mock news page. Task: open one specific article.
const ARTICLES = [
  { id: 'library', title: 'The new city library opens on Monday', teaser: 'Four floors, a quiet room and free classes.', body: 'The new city library opens its doors on Monday at 9 a.m. It has four floors, a quiet reading room, and free computer classes every week. Every entrance has a ramp and automatic doors, and the help desk can lend tablets with large-text settings.' },
  { id: 'weather', title: 'Sunny weekend ahead', teaser: 'Warm days, cool nights.', body: 'Forecasters expect clear skies all weekend, with warm afternoons and cool evenings.' },
  { id: 'bus', title: 'Bus line 12 changes its route', teaser: 'Two new stops near the hospital.', body: 'From next month, line 12 will stop twice near the hospital and run every ten minutes.' },
  { id: 'market', title: 'Farmers market moves indoors', teaser: 'Same vendors, new hall.', body: 'The weekly farmers market moves into the old train hall for the winter season.' },
  { id: 'park', title: 'Park cleanup this Saturday', teaser: 'Volunteers welcome.', body: 'Neighbors are invited to help clean the riverside park on Saturday morning.' },
  { id: 'museum', title: 'Museum adds a night tour', teaser: 'Every Friday at 7 p.m.', body: 'The science museum now offers a guided night tour every Friday evening.' },
];
const GOAL = 'library';

export function createNewsScreen({ root, feedback, onTaskDone }) {
  const grid = root.querySelector('#news-grid');
  const list = root.querySelector('#news-list');
  const article = root.querySelector('#news-article');
  const task = root.querySelector('#news-task');
  const goal = ARTICLES.find((a) => a.id === GOAL);

  for (const a of ARTICLES) {
    const b = document.createElement('button');
    b.className = 'btn news-card';
    b.id = `news-${a.id}`;
    const strong = document.createElement('strong');
    strong.textContent = a.title;
    const span = document.createElement('span');
    span.textContent = a.teaser;
    b.append(strong, span);
    b.addEventListener('click', () => open(a));
    grid.appendChild(b);
  }

  function open(a) {
    root.querySelector('#article-title').textContent = a.title;
    root.querySelector('#article-body').textContent = a.body;
    list.classList.add('hidden');
    article.classList.remove('hidden');
    if (a.id === GOAL) {
      task.textContent = 'Task done! You opened the article about the new city library.';
      task.classList.add('done');
      feedback.toast('Task done!');
      onTaskDone?.('news');
    } else {
      feedback.toast('Not this one. Go back and find the library article.', { kind: 'warn' });
    }
  }

  root.querySelector('#news-back').addEventListener('click', () => {
    article.classList.add('hidden');
    list.classList.remove('hidden');
  });

  return {
    reset() {
      task.textContent = `Task: open the article "${goal.title}".`;
      task.classList.remove('done');
      article.classList.add('hidden');
      list.classList.remove('hidden');
    },
  };
}
