export type AchievementMotionVariant = 'b' | 'c';

const timing = {
  b: { speed: 1.5, finalStart: 1010, end: 1650 },
  c: { speed: 1.25, finalStart: 720, end: 1450 },
} as const;

export function achievementMotionTime(variant: AchievementMotionVariant, elapsed: number) {
  const { speed, finalStart, end } = timing[variant];
  const intro = finalStart / speed;
  return Math.min(end, elapsed <= intro ? elapsed * speed : finalStart + elapsed - intro);
}

export function startAchievementMotion(root: HTMLDivElement, variant: AchievementMotionVariant) {
  const popup = root.querySelector<HTMLElement>('.achievement-notice')!;
  const effects = root.querySelector<HTMLElement>('.achievement-motion-effects')!;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const jobs: Animation[] = [];
  let raf = 0;
  let finished = false;
  let elapsed = 0;
  let previous = performance.now();
  const finish = () => {
    finished = true;
    cancelAnimationFrame(raf);
    jobs.forEach((job) => job.cancel());
    popup.inert = false;
    effects.hidden = true;
    root.dataset.motionState = 'ready';
  };
  // Без Web Animations и при сокращённом движении содержимое сразу доступно.
  if (reduced?.matches || !popup.animate || document.hidden) {
    finish();
    return finish;
  }

  effects.hidden = false;
  const art = root.querySelector<HTMLElement>('.achievement-notice-art')!;
  const position = art.getBoundingClientRect();
  const bounds = root.getBoundingClientRect();
  const x = position.left - bounds.left + position.width / 2;
  const y = position.top - bounds.top + position.height / 2;
  root.querySelectorAll<HTMLElement>('.achievement-motion-paper').forEach((paper) => {
    paper.style.left = `${x - paper.offsetWidth / 2}px`;
    paper.style.top = `${y - paper.offsetHeight / 2}px`;
  });
  const stamp = root.querySelector<HTMLElement>('.achievement-motion-stamp');
  if (stamp) {
    stamp.style.left = `${x + 22}px`;
    stamp.style.top = `${y - 30}px`;
  }
  const ease = 'cubic-bezier(.16,1,.3,1)';
  function motion(
    selector: string | HTMLElement,
    frames: Keyframe[],
    ms: number,
    delay = 0,
    easing = ease,
  ) {
    const element =
      typeof selector === 'string' ? root.querySelector<HTMLElement>(selector)! : selector;
    const animation = element.animate(frames, { duration: ms, delay, fill: 'both', easing });
    animation.pause();
    animation.currentTime = 0;
    jobs.push(animation);
  }
  if (variant === 'b') {
    motion(
      '.achievement-motion-envelope',
      [
        { opacity: 0, transform: 'translateY(80px) rotate(-8deg) scale(.8)', offset: 0 },
        { opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)', offset: 0.2 },
        { opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)', offset: 0.75 },
        { opacity: 0, transform: 'translateY(60px) rotate(3deg) scale(.9)', offset: 1 },
      ],
      1250,
      0,
      'linear',
    );
    motion(
      '.achievement-motion-seal',
      [
        { opacity: 1, transform: 'scale(1) rotate(0deg)' },
        { opacity: 0, transform: 'translateY(-18px) scale(1.3) rotate(-25deg)' },
      ],
      240,
      250,
    );
    motion(
      '.achievement-motion-flap',
      [
        { transform: 'rotateX(0deg)', opacity: 1, zIndex: 4, offset: 0 },
        { transform: 'rotateX(-90deg)', opacity: 1, zIndex: 4, offset: 0.49 },
        { transform: 'rotateX(-91deg)', opacity: 1, zIndex: 1, offset: 0.5 },
        { transform: 'rotateX(-175deg)', opacity: 1, zIndex: 1, offset: 1 },
      ],
      420,
      300,
    );
    motion(
      '.achievement-motion-ticket',
      [
        { transform: 'translateY(20px) rotate(0deg)' },
        { transform: 'translateY(-128px) rotate(-5deg)' },
      ],
      610,
      490,
    );
    motion(
      popup,
      [
        {
          opacity: 0,
          transform: 'translateY(28px) scale(.88)',
          clipPath: 'inset(65% 18% 0% 18% round 12px)',
        },
        {
          opacity: 1,
          transform: 'translateY(0) scale(1)',
          clipPath: 'inset(0% 0% 0% 0% round 16px)',
        },
      ],
      540,
      1010,
    );
    motion(
      '.achievement-notice-art img',
      [
        { opacity: 0, transform: 'scale(.9)' },
        { opacity: 1, transform: 'scale(1.2)' },
      ],
      330,
      1180,
    );
  }
  if (variant === 'c') {
    [
      '.achievement-motion-deck-1',
      '.achievement-motion-deck-2',
      '.achievement-motion-deck-3',
    ].forEach((s, i) => {
      const sign = i === 1 ? 1 : -1;
      motion(
        s,
        [
          {
            opacity: 0,
            transform: `translate(${sign * (120 - i * 20)}px,90px) rotate(${sign * 35}deg) scale(.7)`,
            offset: 0,
          },
          {
            opacity: 1,
            transform: `translate(${(i - 1) * 30}px,-45px) rotate(${(i - 1) * 18}deg) scale(1)`,
            offset: 0.35,
          },
          {
            opacity: 1,
            transform: `translate(${(1 - i) * 45}px,-${55 + i * 12}px) rotate(${(1 - i) * 28}deg) scale(1)`,
            offset: 0.62,
          },
          {
            opacity: 1,
            transform: `translate(${(i - 1) * 4}px,0) rotate(${(i - 1) * 3}deg) scale(.8)`,
            offset: 0.88,
          },
          { opacity: 0, transform: 'translate(0,0) rotate(0deg) scale(.65)', offset: 1 },
        ],
        900,
        60 * i,
        'linear',
      );
    });
    motion(
      popup,
      [
        {
          opacity: 0,
          transform: 'scale(.86) rotate(-2deg)',
          clipPath: 'inset(24% 65% 32% 4% round 12px)',
        },
        {
          opacity: 1,
          transform: 'scale(1) rotate(0deg)',
          clipPath: 'inset(0% 0% 0% 0% round 16px)',
        },
      ],
      480,
      720,
    );
    motion(
      '.achievement-notice-art img',
      [
        { opacity: 0, transform: 'scale(.8)' },
        { opacity: 1, transform: 'scale(1.2)' },
      ],
      240,
      900,
    );
    motion(
      '.achievement-motion-stamp',
      [
        { opacity: 0, transform: 'scale(2.4) rotate(-28deg)', offset: 0 },
        { opacity: 1, transform: 'scale(.95) rotate(-12deg)', offset: 0.35 },
        { opacity: 1, transform: 'scale(1) rotate(-12deg)', offset: 0.62 },
        { opacity: 0, transform: 'scale(1.12) rotate(-12deg)', offset: 1 },
      ],
      460,
      990,
    );
  }
  root.dataset.motionState = 'playing';
  popup.inert = true;
  effects.hidden = false;
  const tick = (now: number) => {
    // Один таймлайн сохраняет исходное движение всех слоёв на границе скоростей.
    elapsed += Math.max(0, now - previous);
    previous = now;
    const sourceTime = achievementMotionTime(variant, elapsed);
    jobs.forEach((job) => {
      job.currentTime = sourceTime;
    });
    popup.inert = sourceTime < timing[variant].finalStart;
    if (sourceTime >= timing[variant].end) finish();
    else raf = requestAnimationFrame(tick);
  };
  const onVisibility = () => {
    if (document.hidden) finish();
  };
  const onPreference = () => {
    if (reduced?.matches) finish();
  };
  // При смене геометрии завершаем короткую сцену, не перезапуская поздравление.
  const onResize = () => {
    if (!finished) finish();
  };
  reduced?.addEventListener('change', onPreference);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  root.addEventListener('focusin', finish);
  raf = requestAnimationFrame(tick);
  return () => {
    finish();
    reduced?.removeEventListener('change', onPreference);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    root.removeEventListener('focusin', finish);
  };
}
