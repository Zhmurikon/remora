// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { achievementMotionTime, startAchievementMotion } from './achievement-motion';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['b', 1.5, 1010, 1650],
  ['c', 1.25, 720, 1450],
] as const)(
  '%s ускоряет начало и сохраняет непрерывный финал на 100%%',
  (variant, speed, boundary, end) => {
    expect(achievementMotionTime(variant, 200)).toBe(200 * speed);
    expect(achievementMotionTime(variant, boundary / speed)).toBeCloseTo(boundary);
    expect(achievementMotionTime(variant, boundary / speed + 200)).toBeCloseTo(boundary + 200);
    expect(achievementMotionTime(variant, 10000)).toBe(end);
  },
);

function setup(reduce = false) {
  const preference = Object.assign(new EventTarget(), { matches: reduce });
  vi.stubGlobal('matchMedia', () => preference);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => callbacks.push(fn));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const jobs: {
    currentTime: number;
    pause: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  const animate = vi.fn(() => {
    const job = { currentTime: 0, pause: vi.fn(), cancel: vi.fn() };
    jobs.push(job);
    return job;
  });
  vi.stubGlobal('Animation', class {});
  const root = document.createElement('div');
  root.innerHTML = `<aside class="achievement-notice"><div class="achievement-notice-art"><img alt=""></div><button>Закрыть</button></aside>
    <div class="achievement-motion-effects"><div class="achievement-motion-envelope"></div><div class="achievement-motion-seal"></div><div class="achievement-motion-flap"></div><div class="achievement-motion-ticket"></div></div>`;
  document.body.append(root);
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.animate = animate as unknown as typeof element.animate;
  });
  const popup = root.querySelector<HTMLElement>('aside')!;
  const cleanup = startAchievementMotion(root, 'b');
  return {
    root,
    popup,
    preference,
    jobs,
    animate,
    cleanup,
    tick: (now: number) => callbacks.shift()!(now),
  };
}

it('ведёт слои одним таймлайном и освобождает их после финала', () => {
  const { root, popup, jobs, tick, cleanup } = setup();
  expect(root.dataset.motionState).toBe('playing');
  expect(popup.inert).toBe(true);
  tick(200);
  expect(jobs.every((job) => job.currentTime === 300)).toBe(true);
  tick(800);
  expect(popup.inert).toBe(false);
  tick(1400);
  expect(root.dataset.motionState).toBe('ready');
  expect(jobs.every((job) => job.cancel.mock.calls.length === 1)).toBe(true);
  cleanup();
});

it('при reduced motion сразу показывает доступное уведомление без движущихся слоёв', () => {
  const { root, popup, animate, cleanup } = setup(true);
  expect(animate).not.toHaveBeenCalled();
  expect(root.dataset.motionState).toBe('ready');
  expect(popup.inert).toBe(false);
  cleanup();
});

it('при включении reduced motion завершает сцену и удаляет обработчик при размонтировании', () => {
  const { root, popup, preference, jobs, cleanup } = setup();
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  expect(root.dataset.motionState).toBe('ready');
  expect(popup.inert).toBe(false);
  cleanup();
  const cancels = jobs[0]!.cancel.mock.calls.length;
  preference.dispatchEvent(new Event('change'));
  expect(jobs[0]!.cancel).toHaveBeenCalledTimes(cancels);
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
