import { shuffleWithSeed } from '@remora/core';
import { Button, CardFace } from '@remora/ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStudyStore, type QueueItem } from './study-store';
import type { SpokenSide } from './use-learn-narration';
import './match-pairs.css';

type Side = 'term' | 'definition';
type Selection = { item: QueueItem; side: Side };
function opposite(side: Side): Side {
  return side === 'term' ? 'definition' : 'term';
}

export function MatchPairs({
  items,
  seed,
  onPair,
  onComplete,
  speak,
}: {
  items: QueueItem[];
  seed: string;
  onPair: (item: QueueItem, correct: boolean, firstSide: Side) => void;
  onComplete: () => void;
  speak: (...sides: SpokenSide[]) => void;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [promptSide, setPromptSide] = useState<Side>('definition');
  const [position, setPosition] = useState(0);
  const [solved, setSolved] = useState(new Set<string>());
  const mistakes = useRef(new Set<string>());
  const [wrong, setWrong] = useState<{ id: string; side: Side; attempt: number } | null>(null);
  const [message, setMessage] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const advance = useRef<number | undefined>(undefined);
  function cancelAdvance() {
    window.clearTimeout(advance.current);
  }
  useEffect(() => cancelAdvance, []);
  const terms = useMemo(() => shuffleWithSeed(items, seed + 'terms'), [items, seed]);
  const definitions = useMemo(() => shuffleWithSeed(items, seed + 'defs'), [items, seed]);
  const prompts = promptSide === 'definition' ? definitions : terms;
  const options = promptSide === 'definition' ? terms : definitions;
  const current = prompts[position]!;
  const answerSide = opposite(promptSide);
  const page = useRef<HTMLDivElement>(null);
  const previousPage = useRef({ position, promptSide });
  useLayoutEffect(() => {
    const previous = previousPage.current;
    previousPage.current = { position, promptSide };
    if (previous.position === position && previous.promptSide === promptSide) return;
    if (!window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) return;
    const shift = position < previous.position ? -12 : 12;
    const motion = page.current?.animate?.(
      [
        { opacity: 0.55, transform: `translateX(${shift}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 240, easing: 'ease-out' },
    );
    return () => motion?.cancel();
  }, [position, promptSide]);
  useEffect(() => {
    if (hand.current?.getClientRects().length)
      speak({ text: current.card[promptSide], lang: current[`lang_${promptSide}`] });
  }, [current, promptSide, speak]);
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
    cancelAdvance();
    if (next < 0 || next >= items.length || next === position) return;
    setPosition(next);
    setSelected(null);
    setWrong(null);
    setMessage('');
  }
  function pick(question: QueueItem, choice: QueueItem, firstSide: Side, fromPager = false) {
    if (solved.has(question.card.id) || solved.has(choice.card.id)) return;
    const secondSide = opposite(firstSide);
    if (question.card.id !== choice.card.id) {
      // Повторный промах прерывает серию, даже когда оценка этой пары уже записана.
      if (mistakes.current.has(question.card.id)) {
        useStudyStore.setState({ rewardStreak: 0 });
      } else {
        mistakes.current.add(question.card.id);
        onPair(question, false, firstSide);
      }
      setWrong((old) => ({
        id: choice.card.id,
        side: secondSide,
        attempt: (old?.attempt ?? 0) + 1,
      }));
      setMessage('Пара не совпала. Попробуйте другое сочетание.');
      if (
        window.matchMedia?.('(pointer: coarse) and (prefers-reduced-motion: no-preference)').matches
      )
        navigator.vibrate?.(20);
      return;
    }
    const nextSolved = new Set([...solved, question.card.id]);
    setSolved(nextSolved);
    if (fromPager) {
      for (let offset = 1; offset < prompts.length; offset++) {
        const next = (position + offset) % prompts.length;
        if (nextSolved.has(prompts[next]!.card.id)) continue;
        advance.current = window.setTimeout(() => visit(next), 1000);
        break;
      }
    }
    setSelected(null);
    setWrong(null);
    const complete = solved.size + 1 === items.length;
    setMessage(complete ? 'Все пары собраны.' : 'Пара собрана.');
    if (!mistakes.current.has(question.card.id)) onPair(question, true, firstSide);
    // Завершение доски даёт одну награду, в том числе после исправления последней пары.
    if (complete) {
      useStudyStore.setState((state) => ({ rewardCount: state.rewardCount + 1 }));
      onComplete();
    }
    speak({
      text: choice.card[secondSide],
      lang: choice[`lang_${secondSide}`],
    });
  }
  function selectTile(item: QueueItem, side: Side) {
    cancelAdvance();
    if (selected && selected.side !== side) {
      pick(selected.item, item, selected.side);
      return;
    }
    setSelected(selected?.item === item ? null : { item, side });
    setWrong(null);
    setMessage('');
    speak({ text: item.card[side], lang: item[`lang_${side}`] });
  }
  function pulse(id: string, side: Side) {
    return wrong?.id === id && wrong.side === side ? (
      <span key={wrong.attempt} aria-hidden="true" className="match-pulse" />
    ) : null;
  }
  const face = (item: QueueItem, side: Side) => <CardFace card={item.card} side={side} />;
  function tile(item: QueueItem, side: Side) {
    return (
      <button
        key={item.card.id}
        data-term={side === 'term' ? item.card.id : undefined}
        data-def={side === 'definition' ? item.card.id : undefined}
        className="match-tile"
        disabled={solved.has(item.card.id)}
        aria-pressed={selected?.side === side && selected.item === item}
        onClick={() => selectTile(item, side)}
      >
        {face(item, side)}
        {pulse(item.card.id, side)}
      </button>
    );
  }
  return (
    <section className="match-round" aria-label="Соедините пары">
      <p>
        Собрано {solved.size} из {items.length}
      </p>
      <div className="match-board" ref={board}>
        <div>{terms.map((item) => tile(item, 'term'))}</div>
        <svg aria-hidden="true">
          {paths.map((path, i) => (
            <path key={i} d={path} />
          ))}
        </svg>
        <div>{definitions.map((item) => tile(item, 'definition'))}</div>
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
        <nav aria-label={promptSide === 'term' ? 'Термины раунда' : 'Определения раунда'}>
          <button
            aria-label={promptSide === 'term' ? 'Предыдущий термин' : 'Предыдущее определение'}
            disabled={position === 0}
            onClick={() => visit(position - 1)}
          >
            ←
          </button>
          {prompts.map((item, i) => (
            <button
              key={item.card.id}
              aria-label={`${promptSide === 'term' ? 'Термин' : 'Определение'} ${i + 1}${solved.has(item.card.id) ? ', пара собрана' : ''}`}
              aria-current={i === position ? 'step' : undefined}
              onClick={() => visit(i)}
            >
              <span className={solved.has(item.card.id) ? 'match-solved' : ''}>{i + 1}</span>
            </button>
          ))}
          <button
            aria-label={promptSide === 'term' ? 'Следующий термин' : 'Следующее определение'}
            disabled={position === items.length - 1}
            onClick={() => visit(position + 1)}
          >
            →
          </button>
        </nav>
        <div className="match-page" ref={page}>
          <div className="match-prompt">
            <p>
              {solved.has(current.card.id)
                ? 'Пара собрана'
                : promptSide === 'term'
                  ? 'Выберите определение'
                  : 'Выберите термин'}
            </p>
            {face(current, promptSide)}
          </div>
          {options.map((item) => (
            <button
              className={
                'match-tile ' +
                (solved.has(item.card.id) ? (item === current ? 'match-solved' : 'match-used') : '')
              }
              key={item.card.id}
              disabled={solved.has(item.card.id) || solved.has(current.card.id)}
              onClick={() => pick(current, item, promptSide, true)}
            >
              {face(item, answerSide)}
              {pulse(item.card.id, answerSide)}
            </button>
          ))}
        </div>
        {solved.size < items.length && (
          <Button
            variant="ghost"
            className="match-switch"
            onClick={() => {
              cancelAdvance();
              setPromptSide(answerSide);
              setPosition(options.indexOf(current));
              setSelected(null);
              setWrong(null);
              setMessage('');
            }}
          >
            {promptSide === 'term' ? 'Начать с определения' : 'Начать с термина'}
          </Button>
        )}
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
