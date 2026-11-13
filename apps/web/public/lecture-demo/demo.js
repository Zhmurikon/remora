/* global SheetButton, document */
'use strict';

const demo = document.querySelector('.demo');
const find = (selector) => demo.querySelector(selector);
const cards = [
  {
    question: 'Утром было 12 °C, днём — 20 °C. На сколько потеплело?',
    options: ['На 4 °C', 'На 8 °C', 'На 12 °C', 'На 16 °C'],
    answer: 'На 8 °C',
    explanation: 'Разница между замерами — 20 − 12 = 8 °C.',
  },
  {
    question: 'Четыре замера дали 12, 16, 20 и 16 °C. Найдёте среднее?',
    options: ['14 °C', '18 °C', '16 °C', '20 °C'],
    answer: '16 °C',
    explanation: 'Сумма четырёх температур равна 64. Делим на 4 и получаем 16 °C.',
  },
  {
    question: 'Как найти размах температур за день?',
    options: [
      'Сложить все замеры',
      'Взять среднее',
      'Посчитать замеры',
      'Вычесть минимум из максимума',
    ],
    answer: 'Вычесть минимум из максимума',
    explanation: 'Размах показывает, насколько различаются самый высокий и самый низкий замеры.',
  },
];

function newSession() {
  return { index: 0, score: 0, selected: null };
}

let session = newSession();
let view = 'learn';

function renderOptions(card, selected) {
  const answered = selected !== null;
  const buttons = card.options.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option';
    button.dataset.sheet = 'outline';
    button.dataset.option = index;
    button.disabled = answered;
    button.classList.toggle('correct', answered && option === card.answer);
    button.classList.toggle('wrong', selected === index && option !== card.answer);
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.ariaHidden = 'true';
    letter.textContent = 'АБВГ'[index];
    button.append(letter, option);
    return SheetButton.attach(button);
  });
  find('.options').replaceChildren(...buttons);
  const feedback = find('.feedback');
  feedback.textContent = answered
    ? (card.options[selected] === card.answer ? 'Верно. ' : 'Не совсем. ') + card.explanation
    : '';
  const next = find('[data-action="next"]');
  next.hidden = !answered;
  SheetButton.setText(
    next,
    session.index === cards.length - 1 ? 'Показать результат' : 'Следующий вопрос',
  );
}

function renderStudy(session) {
  const card = cards[session.index];
  find('#counter').textContent = 'Карточка ' + (session.index + 1) + ' из ' + cards.length;
  find('.meter').replaceChildren(
    ...cards.map((_, index) => {
      const segment = document.createElement('i');
      segment.classList.toggle('on', index <= session.index);
      return segment;
    }),
  );
  find('#question').textContent = card.question;
  renderOptions(card, session.selected);
}

function render(focus = null) {
  let panel = view;
  if (view === 'learn') {
    if (session.index === cards.length) {
      panel = 'result';
      find('[data-panel="result"] h2').textContent = 'Карточки пройдены';
      find('[data-panel="result"] p').textContent =
        'Верных ответов — ' + session.score + ' из ' + cards.length + '.';
    } else {
      panel = 'study';
      renderStudy(session);
    }
  }
  for (const element of demo.querySelectorAll('[data-panel]')) {
    element.hidden = element.dataset.panel !== panel;
  }
  for (const button of demo.querySelectorAll('nav [data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (focus) find('[data-panel]:not([hidden])').querySelector(focus).focus();
}

demo.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.view) {
    view = button.dataset.view;
    render('h2');
    return;
  }

  if (button.hasAttribute('data-option')) {
    const card = cards[session.index];
    session.selected = Number(button.dataset.option);
    if (card.options[session.selected] === card.answer) session.score++;
    render('[data-action="next"]');
    return;
  }

  switch (button.dataset.action) {
    case 'restart':
      session = newSession();
      break;
    case 'next':
      session.index++;
      session.selected = null;
      break;
    default:
      return;
  }
  render('h2');
});

render();
