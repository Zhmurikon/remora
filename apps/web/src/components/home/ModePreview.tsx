'use client';

import { useState } from 'react';
import { HomeIcon } from './HomeIcon';

const modes = [
  {
    name: 'Карточки',
    text: 'Вспомните ответ, затем переверните карточку и проверьте себя.',
    icon: 'cards',
  },
  {
    name: 'Заучивание',
    text: 'Практикуйтесь и возвращайтесь к карточкам по расписанию повторений.',
    icon: 'clock',
  },
  {
    name: 'Тест',
    text: 'Проверьте знания по набору и разберите ошибки после завершения.',
    icon: 'check',
  },
  {
    name: 'Письмо',
    text: 'Впишите ответ самостоятельно — без подсказки из вариантов.',
    icon: 'pen',
  },
  {
    name: 'Аудирование',
    text: 'Прослушайте слово и запишите то, что услышали.',
    icon: 'headphones',
  },
] as const;

export function ModePreview() {
  const [mode, setMode] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const active = modes[mode]!;
  return (
    <div className="home-mode-explorer">
      <div className="home-mode-buttons" role="group" aria-label="Посмотреть режим обучения">
        {modes.map((item, index) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={mode === index}
            onClick={() => {
              setMode(index);
              setFlipped(false);
            }}
          >
            <HomeIcon name={item.icon} />
            {item.name}
          </button>
        ))}
      </div>
      <div className="home-mode-stage" aria-live="polite">
        <span className="home-mini-label">Пример режима · {active.name}</span>
        {mode === 0 ? (
          <button
            type="button"
            className="home-flip-card"
            onClick={() => setFlipped(!flipped)}
            aria-label={flipped ? 'Знание. Показать слово' : 'Knowledge. Показать перевод'}
          >
            <span key={String(flipped)} className="home-enter">
              {flipped ? 'Знание' : 'Knowledge'}
            </span>
            <small>{flipped ? 'Нажмите, чтобы вернуться' : 'Нажмите, чтобы перевернуть'}</small>
          </button>
        ) : (
          <div className="home-mode-sample home-enter" key={mode}>
            <HomeIcon name={active.icon} />
            <strong>
              {mode === 4
                ? 'Слушайте. Вспоминайте. Записывайте.'
                : mode === 3
                  ? 'Как переводится knowledge?'
                  : mode === 2
                    ? 'Что вы уже запомнили?'
                    : 'Время вспомнить изученное'}
            </strong>
            <p>{active.text}</p>
            <a href="#demo" className="home-link">
              Попробовать вопросы в демо
              <HomeIcon name="arrow" />
            </a>
          </div>
        )}
        {mode === 0 && <p className="home-muted">{active.text}</p>}
      </div>
    </div>
  );
}
