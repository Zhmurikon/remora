'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, FishMark } from '@remora/ui';
import { HomeIcon } from './HomeIcon';

const questions = [
  {
    subject: 'География',
    question: 'Столица Японии?',
    options: ['Токио', 'Сеул', 'Пекин', 'Бангкок'],
    answer: 0,
    explanation: 'Токио — столица Японии.',
    icon: 'globe',
  },
  {
    subject: 'Английский',
    question: 'Как переводится knowledge?',
    options: ['Смелость', 'Знание', 'Путешествие', 'Вопрос'],
    answer: 1,
    explanation: 'Knowledge переводится как «знание».',
    icon: 'book',
  },
  {
    subject: 'Биология',
    question: 'Как растения превращают энергию света в химическую?',
    options: ['Дыхание', 'Испарение', 'Фотосинтез', 'Деление'],
    answer: 2,
    explanation: 'Этот процесс называется фотосинтезом.',
    icon: 'leaf',
  },
  {
    subject: 'Геометрия',
    question: 'Сумма углов треугольника на плоскости?',
    options: ['90°', '360°', '270°', '180°'],
    answer: 3,
    explanation: 'В евклидовой геометрии сумма углов треугольника равна 180°.',
    icon: 'pen',
  },
  {
    subject: 'Литература',
    question: 'Кто написал «Евгения Онегина»?',
    options: ['Лев Толстой', 'Александр Пушкин', 'Михаил Лермонтов', 'Николай Гоголь'],
    answer: 1,
    explanation: 'Автор романа в стихах — Александр Пушкин.',
    icon: 'book',
  },
] as const;

export function HomeDemo() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);
  const question = questions[step]!;

  useEffect(() => {
    if (!interacted.current) return;
    if (finished) resultRef.current?.focus();
    else if (selected !== null) nextRef.current?.focus();
    else questionRef.current?.focus();
  }, [finished, selected, step]);

  function answer(index: number) {
    if (selected !== null) return;
    interacted.current = true;
    setSelected(index);
    if (index === question.answer) setScore((value) => value + 1);
  }

  function next() {
    if (step === questions.length - 1) setFinished(true);
    else {
      setStep((value) => value + 1);
      setSelected(null);
    }
  }

  function restart() {
    setStep(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  }

  return (
    <div className="home-demo-wrap">
      <div className="home-note home-note-mint" aria-hidden="true">
        Понять.
        <br />
        Вспомнить.
        <br />
        <span>Запомнить.</span>
      </div>
      <div className="home-note home-note-peach" aria-hidden="true">
        Сегодня
        <br />
        немного больше,
        <br />
        чем вчера.
        <HomeIcon name="spark" />
      </div>
      <section
        id="demo"
        className="home-demo"
        aria-label="Демо обучения без регистрации"
        tabIndex={-1}
      >
        <aside className="home-demo-sidebar" aria-label="Темы демо">
          <span className="home-brand">
            <FishMark />
            Remora
          </span>
          <p className="home-mini-label">Пять вопросов обо всём</p>
          {questions.map((item, index) => (
            <div
              key={item.subject}
              className={index === step && !finished ? 'home-subject is-active' : 'home-subject'}
              aria-current={index === step && !finished ? 'step' : undefined}
            >
              <HomeIcon name={item.icon} />
              {item.subject}
              {index < step || finished ? <HomeIcon name="check" /> : null}
            </div>
          ))}
          <span className="home-sidebar-bottom">
            <HomeIcon name="cards" />
            Ваши темы будут здесь
          </span>
        </aside>
        <div className="home-demo-content">
          <div className="home-demo-top">
            <span className="home-pill">Демо · 5 вопросов</span>
            <progress
              value={finished ? 5 : step + (selected === null ? 0 : 1)}
              max={5}
              aria-label="Пройдено вопросов"
            />
            <span>{finished ? 'Готово' : `${step + 1} из 5`}</span>
          </div>
          {finished ? (
            <div className="home-demo-result home-enter">
              <span className="home-result-icon">
                <HomeIcon name="check" />
              </span>
              <h2 tabIndex={-1} ref={resultRef}>
                Первый шаг сделан
              </h2>
              <p>
                Верных ответов: <strong>{score} из 5</strong>
              </p>
              <p className="home-muted">Теперь попробуйте так же — со своим конспектом.</p>
              <a className="home-button" href="/register">
                Создать свои карточки
                <HomeIcon name="arrow" />
              </a>
              <button type="button" className="home-text-button" onClick={restart}>
                Пройти ещё раз
              </button>
              <small className="home-muted">
                Это демо. Результат не записывается в учебный прогресс.
              </small>
            </div>
          ) : (
            <div className="home-demo-question home-enter" key={step}>
              <p className="home-question-subject">
                <HomeIcon name={question.icon} />
                {question.subject}
              </p>
              <h2 id="demo-question" ref={questionRef} tabIndex={-1}>
                {question.question}
              </h2>
              <div className="home-options" role="group" aria-labelledby="demo-question">
                {question.options.map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => answer(index)}
                    disabled={selected !== null}
                    className={cn(
                      'home-option',
                      selected !== null && index === question.answer && 'is-correct',
                      selected === index && index !== question.answer && 'is-wrong',
                    )}
                  >
                    <span className="home-option-letter" aria-hidden="true">
                      {['А', 'Б', 'В', 'Г'][index]}
                    </span>
                    <span>{option}</span>
                    {selected !== null && index === question.answer && <HomeIcon name="check" />}
                  </button>
                ))}
              </div>
              <div className="home-answer-area">
                <p role="status" aria-live="polite" aria-atomic="true">
                  {selected === null
                    ? 'Выберите ответ. Здесь можно ошибаться.'
                    : `${selected === question.answer ? 'Верно!' : 'Не совсем.'} ${question.explanation}`}
                </p>
                {selected !== null && (
                  <button
                    type="button"
                    ref={nextRef}
                    className="home-button home-button-small"
                    onClick={next}
                  >
                    {step === 4 ? 'Показать результат' : 'Следующий вопрос'}
                    <HomeIcon name="arrow" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      <p className="home-demo-caption">
        <HomeIcon name="check" />
        Без регистрации · прямо здесь · в вашем темпе
      </p>
      <noscript>
        <p className="home-demo-caption">
          Для интерактивного демо включите JavaScript. <a href="/kursy">Посмотреть курсы</a>
        </p>
      </noscript>
    </div>
  );
}
