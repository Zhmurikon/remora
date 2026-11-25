import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useStudyStore } from '../study-store';
import { drawFinale, drawPhone, drawSide, atlas } from './paint';
import { clearReward, trackReward } from './playback';
import { durationMs, sceneForStreak, type SessionOutcome } from './round';
import { drawSessionScene, finaleAtlas } from './session-scenes';
import './rewards.css';

// Одна шкала времени для обычного кадра, смены размера и статичной награды.
function play(host: HTMLElement, duration: number, draw: (t: number) => void, image = atlas) {
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let progress = 0;
  let start: number | undefined;
  let resolve!: () => void;
  const finished = new Promise<void>((done) => {
    resolve = done;
  });
  function redraw() {
    if (host.clientWidth) draw(progress);
  }
  function settle() {
    cancelAnimationFrame(frame);
    progress = 1;
    redraw();
    resolve();
  }
  function tick(now: number) {
    start ??= now;
    progress = Math.min(1, (now - start) / duration);
    redraw();
    if (progress === 1) resolve();
    else frame = requestAnimationFrame(tick);
  }
  function preferenceChanged() {
    if (motion?.matches) settle();
  }
  // Загрузка рисунка не задерживает ответ или автопереход даже при разрыве сети.
  image.addEventListener('load', redraw);
  if (!host.clientWidth || motion?.matches) settle();
  else frame = requestAnimationFrame(tick);
  motion?.addEventListener?.('change', preferenceChanged);
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(redraw);
  observer?.observe(host);
  return {
    finished,
    stop() {
      image.removeEventListener('load', redraw);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      motion?.removeEventListener?.('change', preferenceChanged);
      resolve();
    },
  };
}

const finales = {
  perfect: { title: 'Звёздная печать', label: 'Раунд без ошибок', duration: 2576 },
  partial: { title: 'Выход на орбиту', label: 'Спутник выходит на орбиту планеты', duration: 3300 },
  failed: {
    title: 'Мягкая посадка',
    label: 'Лунный модуль совершает мягкую посадку',
    duration: 3400,
  },
} as const;

export function RoundFinale({ outcome }: { outcome: SessionOutcome }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [replay, setReplay] = useState(0);
  const scene = finales[outcome];
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (outcome === 'perfect')
      return play(canvas, scene.duration, (t) => drawFinale(canvas, t)).stop;
    return play(canvas, scene.duration, (t) => drawSessionScene(canvas, outcome, t), finaleAtlas)
      .stop;
  }, [outcome, scene, replay]);
  return (
    <figure className="round-finale" data-outcome={outcome}>
      <button
        type="button"
        className="round-finale__replay"
        aria-label="Повторить анимацию"
        title="Повторить анимацию"
        onClick={() => setReplay((n) => n + 1)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
        </svg>
      </button>
      <canvas
        ref={ref}
        className="study-reward-finale"
        role="img"
        aria-label={scene.label}
        data-reward-pack="space"
      />
      <figcaption>{scene.title}</figcaption>
    </figure>
  );
}

export function AnswerRewards({
  body,
  questionIndex,
}: {
  body: RefObject<HTMLDivElement | null>;
  questionIndex: number;
}) {
  const count = useStudyStore((state) => state.rewardCount);
  const lastCount = useRef(count);
  const field = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const phone = useRef<HTMLCanvasElement>(null);
  const fade = useRef<Animation | null>(null);
  const playing = useRef<ReturnType<typeof play> | null>(null);

  useLayoutEffect(() => {
    const host = field.current;
    if (!host || host.hidden || fade.current) return;
    const hide = () => {
      host.hidden = true;
      playing.current?.stop();
    };
    if (!host.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) hide();
    else {
      const animation = host.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 320,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
      fade.current = animation;
      animation.onfinish = () => {
        if (fade.current === animation) hide();
      };
    }
  }, [questionIndex]);

  useLayoutEffect(() => {
    const container = body.current,
      host = field.current;
    const west = left.current,
      east = right.current,
      backdrop = phone.current;
    if (count === lastCount.current || !container || !host || !west || !east || !backdrop) return;
    const increased = count > lastCount.current;
    lastCount.current = count;
    if (!increased) return;
    const streak = useStudyStore.getState().rewardStreak;
    const scene = sceneForStreak(streak);
    host.hidden = false;
    host.dataset.streak = String(streak);
    const sides: [HTMLCanvasElement, HTMLCanvasElement] = [west, east];
    const run = play(host, durationMs[scene], (t) => {
      sides.forEach((canvas, side) => {
        const ctx = canvas.getContext('2d');
        if (ctx) drawSide(ctx, side, scene, t);
      });
      if (backdrop.clientWidth) {
        const prompt = [
          ...container.querySelectorAll<HTMLElement>(
            '.study-question:not([aria-hidden="true"]), .match-prompt, .match-board',
          ),
        ].find((el) => el.offsetWidth);
        const seam = prompt
          ? prompt.getBoundingClientRect().bottom - backdrop.getBoundingClientRect().top
          : backdrop.clientHeight / 2;
        drawPhone(backdrop, sides, seam, scene, t);
      }
    });
    playing.current = run;
    trackReward(container, run.finished);
    return () => {
      fade.current?.cancel();
      fade.current = null;
      run.stop();
      host.hidden = true;
      clearReward(container);
    };
  }, [body, count]);

  return (
    <div className="study-reward-slot" aria-hidden="true">
      <div className="study-reward-field" data-reward-pack="space" ref={field} hidden>
        <canvas ref={left} width={144} height={126} />
        <canvas ref={right} width={144} height={126} />
        <canvas ref={phone} className="study-reward-phone" />
      </div>
    </div>
  );
}
