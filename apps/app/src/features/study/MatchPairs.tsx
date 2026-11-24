import { shuffleWithSeed } from '@remora/core';
import { Button, CardFace } from '@remora/ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { QueueItem } from './study-store';
import type { SpokenSide } from './use-learn-narration';
import './match-pairs.css';

export function MatchPairs({
  items,
  seed,
  onPair,
  onNext,
  speak,
}: {
  items: QueueItem[];
  seed: string;
  onPair: (item: QueueItem, correct: boolean, mobile: boolean) => void;
  onNext: () => void;
  speak: (...sides: SpokenSide[]) => void;
}) {
  const [term, setTerm] = useState<QueueItem | null>(null);
  const [position, setPosition] = useState(0);
  const [solved, setSolved] = useState(new Set<string>());
  const mistakes = useRef(new Set<string>());
  const [wrong, setWrong] = useState<{ id: string; attempt: number } | null>(null);
  const [message, setMessage] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const terms = useMemo(() => shuffleWithSeed(items, seed + 'terms'), [items, seed]);
  const definitions = useMemo(() => shuffleWithSeed(items, seed + 'defs'), [items, seed]);
  const current = definitions[position]!;
  useEffect(() => {
    if (hand.current?.getClientRects().length)
      speak({ text: current.card.definition, lang: current.lang_definition });
  }, [current, speak]);
  useLayoutEffect(() => {
    const panel = board.current;
    if (!panel || solved.size === 0) return;
    function measure() {
      if (!panel || !panel.offsetWidth) return;
      const rect = panel.getBoundingClientRect();
      const lines = [];
      for (const id of solved) {
        const left = panel.querySelector('[data-term="' + id + '"]')!.getBoundingClientRect();
        const right = panel.querySelector('[data-def="' + id + '"]')!.getBoundingClientRect();
        const x = left.right - rect.left,
          y = left.top + left.height / 2 - rect.top;
        const end = right.left - rect.left,
          target = right.top + right.height / 2 - rect.top;
        const mid = (x + end) / 2;
        lines.push(`M ${x} ${y} C ${mid} ${y}, ${mid} ${target}, ${end} ${target}`);
      }
      setPaths(lines);
    }
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    panel.querySelectorAll('button').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [solved]);
  function visit(next: number) {
    if (next < 0 || next >= items.length || next === position) return;
    setPosition(next);
    setWrong(null);
    setMessage('');
  }
  function pick(left: QueueItem, right: QueueItem, mobile: boolean) {
    if (solved.has(left.card.id) || solved.has(right.card.id)) return;
    if (left.card.id !== right.card.id) {
      const question = mobile ? right : left;
      if (!mistakes.current.has(question.card.id)) {
        mistakes.current.add(question.card.id);
        onPair(question, false, mobile);
      }
      setWrong((old) => ({
        id: (mobile ? left : right).card.id,
        attempt: (old?.attempt ?? 0) + 1,
      }));
      setMessage('Пара не совпала. Попробуйте другое сочетание.');
      if (
        window.matchMedia?.('(pointer: coarse) and (prefers-reduced-motion: no-preference)').matches
      )
        navigator.vibrate?.(20);
      return;
    }
    setSolved(new Set([...solved, left.card.id]));
    setTerm(null);
    setWrong(null);
    setMessage('Пара собрана.');
    if (!mistakes.current.has(left.card.id)) onPair(left, true, mobile);
    speak({
      text: mobile ? left.card.term : left.card.definition,
      lang: mobile ? left.lang_term : left.lang_definition,
    });
  }
  function pulse(id: string) {
    return wrong?.id === id ? (
      <span key={wrong.attempt} aria-hidden="true" className="match-pulse" />
    ) : null;
  }
  const face = (item: QueueItem, side: 'term' | 'definition') => (
    <CardFace card={item.card} side={side} />
  );
  return (
    <section className="match-round" aria-label="Соедините пары">
      <p>
        Собрано {solved.size} из {items.length}
      </p>
      <div className="match-board" ref={board}>
        <div>
          {terms.map((item) => (
            <button
              key={item.card.id}
              data-term={item.card.id}
              className="match-tile"
              disabled={solved.has(item.card.id)}
              aria-pressed={term === item}
              onClick={() => {
                setTerm(term === item ? null : item);
                setWrong(null);
                setMessage('');
                speak({ text: item.card.term, lang: item.lang_term });
              }}
            >
              {face(item, 'term')}
            </button>
          ))}
        </div>
        <svg aria-hidden="true">
          {paths.map((path, i) => (
            <path key={i} d={path} />
          ))}
        </svg>
        <div>
          {definitions.map((item) => (
            <button
              key={item.card.id}
              className="match-tile"
              data-def={item.card.id}
              disabled={solved.has(item.card.id)}
              onClick={() =>
                term ? pick(term, item, false) : setMessage('Сначала выберите термин.')
              }
            >
              {face(item, 'definition')}
              {pulse(item.card.id)}
            </button>
          ))}
        </div>
      </div>
      <div
        className="match-hand"
        ref={hand}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            visit(position + (e.key === 'ArrowRight' ? 1 : -1));
          }
        }}
        onPointerDown={() => {
          swiped.current = false;
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(e) => {
          const start = touch.current,
            t = e.changedTouches[0];
          touch.current = null;
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(t.clientY - start.y)) {
            swiped.current = true;
            visit(position + (dx < 0 ? 1 : -1));
          }
        }}
        onClickCapture={(e) => {
          if (swiped.current && e.detail) {
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        <nav aria-label="Определения раунда">
          <button
            aria-label="Предыдущее определение"
            disabled={position === 0}
            onClick={() => visit(position - 1)}
          >
            ←
          </button>
          {definitions.map((item, i) => (
            <button
              key={item.card.id}
              aria-label={`Определение ${i + 1}${solved.has(item.card.id) ? ', пара собрана' : ''}`}
              aria-current={i === position ? 'step' : undefined}
              onClick={() => visit(i)}
            >
              <span className={solved.has(item.card.id) ? 'match-solved' : ''}>{i + 1}</span>
            </button>
          ))}
          <button
            aria-label="Следующее определение"
            disabled={position === items.length - 1}
            onClick={() => visit(position + 1)}
          >
            →
          </button>
        </nav>
        <div className="match-prompt">
          <p>{solved.has(current.card.id) ? 'Пара собрана' : 'Выберите термин'}</p>
          {face(current, 'definition')}
        </div>
        {terms.map((item) => (
          <button
            className={
              'match-tile ' +
              (solved.has(item.card.id) ? (item === current ? 'match-solved' : 'match-used') : '')
            }
            key={item.card.id}
            disabled={solved.has(item.card.id) || solved.has(current.card.id)}
            onClick={() => pick(item, current, true)}
          >
            {face(item, 'term')}
            {pulse(item.card.id)}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
      {solved.size === items.length && <Button onClick={onNext}>Дальше</Button>}
    </section>
  );
}
