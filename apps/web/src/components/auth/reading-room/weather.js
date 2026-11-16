/* global matchMedia, Path2D, requestAnimationFrame, cancelAnimationFrame, document, Event, ResizeObserver, devicePixelRatio, IntersectionObserver */
/** @param {HTMLElement} stage @param {AbortSignal} signal */
export function startWeather(stage, signal) {
  // Координаты съёмного слоя заданы на мастер-рисунке шириной 800 единиц.
  const canvas = stage.querySelector('#rain');
  const ctx = canvas.getContext('2d');
  const motion = stage.querySelector('#motion');
  let inView = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reduced.matches;
  let time = 0;
  let stormAt = -100;
  // Первая зарница знакомит со сценой; следующие разделены длинной случайной паузой.
  let nextStorm = 4;
  let tick = 0;
  let prev = 0;
  const width = 360,
    height = 530;
  const glass = new Path2D('M236 210 C237 122 308 55 398 55 C487 55 554 119 558 210 Z');
  for (const [x, w] of [
    [236, 86],
    [331, 66],
    [406, 65],
    [480, 78],
  ]) {
    for (const [y, h] of [
      [221, 109],
      [340, 102],
      [453, 106],
    ])
      glass.rect(x, y, w, h);
  }
  const bars = new Path2D(
    'M400 49V211 M327 209 A74 78 0 0 1 474 209 M251 136L332 171 M322 72L364 138 M481 72L439 139 M544 137L469 170',
  );
  const pens = new Path2D(
    'M336 525L353 541L357 552L359 525L366 542L382 523L376 549L389 525L383 560H342Z',
  );
  const drops = Array.from({ length: 540 }, (_, i) => {
    const near = i % 4 === 0;
    return {
      x: Math.random() * 400,
      y: Math.random() * 560,
      speed: (near ? 77 : 40) + Math.random() * 38,
      length: (near ? 6 : 2.5) + Math.random() * 6,
      alpha: (near ? 0.33 : 0.19) + Math.random() * 0.23,
      near,
    };
  });
  const rivulets = [
    [290, 226, 75, 0],
    [447, 60, 114, 3],
    [511, 346, 80, 8],
    [369, 350, 77, 12],
    [496, 222, 91, 6],
  ];
  function draw(elapsed, secondsSinceStorm) {
    const rainTime = elapsed * 2;
    const sinceStorm = secondsSinceStorm * 6;
    const sx = canvas.width / width,
      sy = canvas.height / height;
    ctx.setTransform(sx, 0, 0, sy, -220 * sx, -40 * sy);
    ctx.clearRect(220, 40, width, height);
    ctx.save();
    ctx.clip(glass);
    ctx.lineCap = 'round';
    for (const d of drops) {
      const fall = d.y + rainTime * d.speed;
      const y = 45 + (fall % 540);
      const x = 225 + ((((d.x - fall * 0.13) % 370) + 370) % 370);
      ctx.lineWidth = d.near ? 1.05 : 0.65;
      ctx.strokeStyle = 'rgba(54,79,145,' + d.alpha + ')';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.length * 0.13, y + d.length);
      ctx.stroke();
      if (d.near) {
        ctx.strokeStyle = 'rgba(245,249,255,.56)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + 0.7, y + 2);
        ctx.lineTo(x + 0.7 - d.length * 0.13, y + d.length);
        ctx.stroke();
      }
    }
    for (const [x0, y0, dist, phase] of rivulets) {
      const u = ((rainTime + phase) % 16) / 16;
      if (u > 0.77) continue;
      const k = u / 0.77,
        v = k * k * (3 - 2 * k);
      const x = x0 + Math.sin(v * 8) * 1.15,
        y = y0 + v * dist;
      ctx.globalAlpha = Math.min(1, k * 8, (1 - k) * 9) * 0.75;
      ctx.strokeStyle = '#7694bb';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 - 1.5, (y0 + y) / 2, x, y);
      ctx.stroke();
      ctx.fillStyle = '#536caa';
      ctx.beginPath();
      ctx.ellipse(x, y, 1.15, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f6fbff';
      ctx.fillRect(x - 0.55, y - 0.8, 0.75, 1);
    }
    ctx.globalAlpha = 1;
    // Перед зарницей туча приглушает окно. Один мягкий максимум
    // освещает даже нижние стёкла, затем свет дольше сходит на нет.
    let rimLight = 0;
    if (sinceStorm >= 0 && sinceStorm < 3.5) {
      const ease = (x) => {
        x = Math.min(1, Math.max(0, x));
        return x * x * (3 - 2 * x);
      };
      const cloud = ease(sinceStorm / 0.6) * (1 - ease((sinceStorm - 0.65) / 0.55));
      rimLight = ease((sinceStorm - 0.65) / 0.42) * (1 - ease((sinceStorm - 1.38) / 2.12));
      ctx.fillStyle = 'rgba(42,58,100,' + 0.21 * cloud + ')';
      ctx.fillRect(230, 48, 335, 516);
      const glow = ctx.createRadialGradient(455, 152, 12, 446, 161, 455);
      glow.addColorStop(0, 'rgba(251,252,255,' + 0.91 * rimLight + ')');
      glow.addColorStop(0.55, 'rgba(235,245,255,' + 0.76 * rimLight + ')');
      glow.addColorStop(1, 'rgba(206,227,255,' + 0.41 * rimLight + ')');
      ctx.fillStyle = glow;
      ctx.fillRect(230, 48, 335, 516);
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6.4;
    ctx.stroke(bars);
    ctx.fillStyle = '#000';
    ctx.fill(pens);
    ctx.restore();
    if (rimLight > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(221,239,255,' + 0.72 * rimLight + ')';
      ctx.lineWidth = 1.6;
      ctx.stroke(
        new Path2D(
          'M230 332V212C230 116 307 49 401 49C491 49 561 122 562 211 M232 335H561 M404 219V441 M233 447H559',
        ),
      );
      ctx.restore();
    }
  }

  function loop(now) {
    if (prev) time += Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (time >= nextStorm) {
      stormAt = time;
      nextStorm = time + 35 + Math.random() * 45;
    }
    draw(time, time - stormAt);
    tick = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(tick);
    prev = 0;
    const active = playing && inView && !document.hidden;
    stage.dataset.moving = String(active);
    stage.dispatchEvent(new Event('scene-motion'));
    motion.setAttribute('aria-pressed', String(!playing));
    const label = playing ? 'Приостановить анимацию' : 'Включить анимацию';
    motion.setAttribute('aria-label', label);
    motion.title = label;
    if (active) tick = requestAnimationFrame(loop);
  }
  const size = new ResizeObserver(() => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (playing && inView) draw(time, time - stormAt);
  });
  size.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  });
  visibility.observe(stage);
  motion.addEventListener(
    'click',
    () => {
      playing = !playing;
      sync();
    },
    { signal },
  );
  document.addEventListener('visibilitychange', sync, { signal });
  reduced.addEventListener(
    'change',
    () => {
      playing = !reduced.matches;
      if (!playing) {
        ctx.resetTransform();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      sync();
    },
    { signal },
  );
  signal.addEventListener(
    'abort',
    () => {
      size.disconnect();
      visibility.disconnect();
      cancelAnimationFrame(tick);
    },
    { once: true },
  );
  sync();
}
