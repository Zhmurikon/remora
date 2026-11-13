/* global SheetButton, document, window */
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('[role="tabpanel"]')];
const recording = document.querySelector('audio');

const sheet = document.querySelector('.practice-sheet');
const rain = sheet.querySelector('.practice-drawing video');
const rainAllowed = window.matchMedia(
  '(any-hover: hover) and (prefers-reduced-motion: no-preference)',
);

function stopRain() {
  rain.pause();
  rain.classList.remove('is-playing');
}

sheet.addEventListener('pointerenter', (event) => {
  if (event.pointerType === 'touch' || !rainAllowed.matches) return;
  if (!rain.hasAttribute('src')) rain.src = rain.dataset.src;
  rain.play().catch(() => {
    // При отмене наведения или недоступном видео остаётся исходный рисунок.
  });
});
rain.addEventListener('playing', () => {
  if (!rain.paused) rain.classList.add('is-playing');
});
sheet.addEventListener('pointerleave', stopRain);
sheet.addEventListener('pointercancel', stopRain);
rain.addEventListener('error', stopRain);
rainAllowed.addEventListener('change', stopRain);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopRain();
});

function selectTab(tab) {
  for (const item of tabs) {
    item.setAttribute('aria-selected', String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
  recording.pause();
  tab.focus();
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const positions = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!Object.hasOwn(positions, event.key)) return;
    event.preventDefault();
    selectTab(tabs[positions[event.key]]);
  });
}

const cardWord = document.querySelector('#cards h2');
document.querySelector('#flip').addEventListener('click', () => {
  const showTranslation = cardWord.lang === 'en';
  cardWord.lang = showTranslation ? 'ru' : 'en';
  cardWord.textContent = showTranslation ? 'морось' : 'drizzle';
});

for (const form of document.querySelectorAll('.practice-form')) {
  const input = form.querySelector('input');
  const feedback = form.querySelector('[role="status"]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const correct = input.value.trim().toLowerCase() === 'drizzle';
    input.setAttribute('aria-invalid', String(!correct));
    feedback.textContent = correct
      ? 'Верно! Drizzle — «морось».'
      : 'Пока не совпало. Попробуйте ещё раз.';
    if (!correct) {
      input.focus();
      input.select();
    }
  });
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    feedback.textContent = '';
  });
}

const play = document.querySelector('#play');
play.addEventListener('click', async () => {
  try {
    recording.currentTime = 0;
    await recording.play();
    SheetButton.setText(play, '↻ Прослушать ещё раз');
  } catch {
    document.querySelector('#listen [role="status"]').textContent =
      'Не удалось воспроизвести слово. Попробуйте ещё раз.';
  }
});

const words = [
  { word: 'drizzle', translation: 'морось', choices: ['ливень', 'морось', 'туман'] },
  { word: 'fog', translation: 'туман', choices: ['туман', 'ливень', 'морось'] },
];

function setupChoices(mode) {
  const panel = document.getElementById(mode);
  const title = panel.querySelector('h2');
  const choices = panel.querySelector('.practice-choices');
  const feedback = panel.querySelector('[role="status"]');
  const advance = panel.querySelector('.advance');
  const isTest = mode === 'test';
  let queue = words.slice();
  let mistakes = [];
  let total = queue.length;

  function showWord(focus = false) {
    advance.hidden = true;
    choices.replaceChildren();
    feedback.textContent = '';
    const current = queue[0];
    title.lang = 'en';
    title.textContent = current.word;
    if (focus) title.focus();
    for (const translation of current.choices) {
      const option = document.createElement('button');
      option.className = 'secondary';
      option.dataset.sheet = 'outline';
      option.textContent = translation;
      option.addEventListener('click', () => {
        const correct = translation === current.translation;
        queue.shift();
        if (!correct && isTest) mistakes.push(current);
        if (!correct && !isTest) queue.push(current);
        for (const button of choices.children) button.disabled = true;
        if (isTest) {
          feedback.textContent = 'Ответ принят.';
        } else {
          feedback.textContent = correct
            ? 'Верно!'
            : 'Правильный перевод — «' + current.translation + '». Слово встретится ещё раз.';
        }
        SheetButton.setText(advance, queue.length ? 'Следующее слово' : 'Посмотреть результат');
        advance.hidden = false;
        advance.focus();
      });
      choices.append(SheetButton.attach(option));
    }
  }

  function showResult() {
    title.lang = 'ru';
    title.textContent = isTest ? 'Результат теста' : 'Тренировка завершена';
    choices.replaceChildren();
    if (isTest) {
      const corrections = mistakes.map(({ word, translation }) => word + ' — ' + translation);
      feedback.textContent = [
        'Верных ответов: ' + (total - mistakes.length) + ' из ' + total + '.',
        ...corrections,
      ].join('\n');
    } else {
      feedback.textContent = 'Вы вспомнили перевод обоих слов.';
    }
    SheetButton.setText(advance, mistakes.length ? 'Повторить ошибки' : 'Начать заново');
    title.focus();
  }

  let finished = false;
  advance.addEventListener('click', () => {
    if (finished) {
      queue = mistakes.length ? mistakes.slice() : words.slice();
      mistakes = [];
      total = queue.length;
      finished = false;
    }
    if (queue.length) showWord(true);
    else {
      finished = true;
      showResult();
    }
  });
  showWord();
}

setupChoices('learn');
setupChoices('test');
