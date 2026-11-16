/* global cancelAnimationFrame, requestAnimationFrame, performance */
/** @param {HTMLElement} stage @param {AbortSignal} signal */
export function startObjects(stage, signal) {
  const lamp = stage.querySelector('#lamp');
  const ivy = stage.querySelector('#ivy');
  const vine = stage.querySelector('#ivy-effect');
  const chain = stage.querySelector('#chain-effect');
  const stemShift = stage.querySelector('#stem-shift');
  const leafShift = stage.querySelector('#leaf-shift');
  const chainDown = stage.querySelector('#chain-down');
  const chainAcross = stage.querySelector('#chain-across');
  let hover = false;
  let gustUntil = 0;
  let wind = 0;
  let windTime = 0;
  let pullAt = -Infinity;
  let frame = 0;
  let previous = 0;

  function mayAnimate() {
    return stage.dataset.moving === 'true';
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    wind = 0;
    windTime = 0;
    gustUntil = 0;
    pullAt = -Infinity;
    vine.classList.remove('active');
    chain.classList.remove('active');
  }

  function run(now) {
    frame = 0;
    if (!mayAnimate()) {
      reset();
      return;
    }
    const dt = previous ? Math.min((now - previous) / 1000, 0.06) : 1 / 60;
    previous = now;
    const blowing = hover || now < gustUntil;
    const target = blowing ? 1 : 0;
    wind += (target - wind) * (1 - Math.exp(-dt * (blowing ? 5.8 : 5)));
    const leavesMoving = blowing || wind > 0.012;
    vine.classList.toggle('active', leavesMoving);
    if (leavesMoving) {
      windTime += dt;
      const phase = windTime * Math.PI * 2;
      const gust = 0.76 + 0.24 * Math.cos(phase / 3.8);
      stemShift.setAttribute('scale', (13 * wind * gust * Math.sin(phase / 1.64)).toFixed(3));
      leafShift.setAttribute(
        'scale',
        (6.8 * wind * gust * Math.sin(phase / 0.93 - 0.75)).toFixed(3),
      );
    } else {
      windTime = 0;
    }

    // Сначала цепочка натягивается, после отпускания грузик описывает короткую дугу.
    const t = (now - pullAt) / 1000;
    const pulling = t >= 0 && t < 1.05;
    chain.classList.toggle('active', pulling);
    if (pulling) {
      const tug = t < 0.095 ? Math.sin(((t / 0.095) * Math.PI) / 2) : Math.exp(-17 * (t - 0.095));
      const swing = Math.exp(-4.5 * t) * Math.sin(16 * t);
      chainDown.setAttribute('scale', (-9.5 * tug).toFixed(3));
      chainAcross.setAttribute('scale', (9 * swing).toFixed(3));
    }

    if (leavesMoving || pulling) frame = requestAnimationFrame(run);
    else previous = 0;
  }

  function wake() {
    if (!frame && mayAnimate()) frame = requestAnimationFrame(run);
  }

  lamp.addEventListener(
    'click',
    () => {
      const lit = lamp.getAttribute('aria-pressed') !== 'true';
      lamp.setAttribute('aria-pressed', String(lit));
      stage.dataset.lit = String(lit);
      if (mayAnimate()) {
        pullAt = performance.now();
        wake();
      }
    },
    { signal },
  );
  ivy.addEventListener(
    'pointerenter',
    (event) => {
      if (event.pointerType === 'touch') return;
      hover = true;
      wake();
    },
    { signal },
  );
  ivy.addEventListener(
    'pointerleave',
    () => {
      hover = false;
    },
    { signal },
  );
  ivy.addEventListener(
    'pointercancel',
    () => {
      hover = false;
    },
    { signal },
  );
  ivy.addEventListener(
    'click',
    () => {
      if (mayAnimate()) {
        gustUntil = performance.now() + 1650;
        wake();
      }
    },
    { signal },
  );
  stage.addEventListener(
    'scene-motion',
    () => {
      if (!mayAnimate()) reset();
      else if (hover) wake();
    },
    { signal },
  );

  signal.addEventListener('abort', reset, { once: true });
}
