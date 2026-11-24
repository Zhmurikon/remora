import { STUDY_MODE_LABELS } from '@remora/core';
import { Link } from 'react-router-dom';
import cardsImage from '../../../../web/public/lecture-demo/pricing-cards.webp';
import testImage from '../../../../web/public/lecture-demo/news-test.webp';
import cassetteImage from '../../../../web/public/lecture-demo/folio-cassette.webp';
import writingImage from './quiz-art/typing.webp';
import battleImage from './quiz-art/true-false.webp';

const modes = [
  { path: 'flashcards', description: 'Листать и запоминать', image: cardsImage },
  { path: 'write', description: 'Отвечать по памяти', image: writingImage },
  {
    path: 'listen',
    description: 'Слушать и записывать',
    image: cassetteImage,
  },
  { path: 'test', description: 'Проверить знания', image: testImage },
  { path: 'battle', description: 'Сыграть с соперником', image: battleImage },
] as const;

export function SetModes({ setId, disabled = false }: { setId: string; disabled?: boolean }) {
  return (
    <section className="set-secondary" aria-label="Режимы обучения">
      <div className="set-mode-grid">
        {modes.map((mode) => {
          const title = mode.path === 'battle' ? 'Битва' : STUDY_MODE_LABELS[mode.path];
          const content = (
            <>
              <img src={mode.image} width="52" height="50" alt="" />
              <span>
                <b>{title}</b>
                <small>{mode.description}</small>
              </span>
              <span aria-hidden="true">›</span>
            </>
          );
          return disabled ? (
            <span className="set-inactive-mode" aria-disabled="true" key={mode.path}>
              {content}
            </span>
          ) : (
            <Link key={mode.path} aria-label={title} to={`/sets/${setId}/${mode.path}`}>
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
