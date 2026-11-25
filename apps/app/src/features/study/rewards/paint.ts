import sprites from './sprites.png';
import type { AnswerScene } from './round';

const atlas = new Image();
atlas.src = sprites;
export { atlas };

const layers = [[0], [1, 2], [3, 4], [5, 6, 7], [8, 9], [10, 11, 12]] as const;
const colors = ['#ffce5d', '#eb913f', '#8ca7fa', '#be653f'];
const tau = 2 * Math.PI;

export function phase(time: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  layers: readonly number[],
  x: number,
  y: number,
  width: number,
  mirror = false,
) {
  if (!atlas.naturalWidth || width < 1) return;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (mirror) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  const w = Math.round(width);
  const h = Math.round((w * 80) / 96);
  for (const i of layers) {
    ctx.drawImage(
      atlas,
      (i % 6) * 96,
      Math.floor(i / 6) * 80,
      96,
      80,
      -Math.round(w / 2),
      -Math.round(h / 2),
      w,
      h,
    );
  }
  ctx.restore();
}
export function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}
function sky(ctx: CanvasRenderingContext2D, side: number, density: number) {
  for (let i = 0; i < density; i++) {
    const x = 12 + ((i * 53 + side * 37) % 120);
    const y = 11 + ((i * i * 7 + i * 11 + side * 29) % 103);
    pixel(ctx, x, y, 1, i % 3 ? '#c5c5d2' : '#d8ae69');
    if (i % 7 === 0) {
      pixel(ctx, x - 1, y + 1, 1, '#a9aec9');
      pixel(ctx, x + 1, y + 1, 1, '#a9aec9');
      pixel(ctx, x, y + 2, 1, '#a9aec9');
    }
  }
}
function burst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  count: number,
  radius: number,
) {
  if (t <= 0 || t >= 1) return;
  ctx.save();
  ctx.globalAlpha *= Math.sin(Math.PI * t);
  for (let i = 0; i < count; i++) {
    const angle = (tau * i) / count + 0.18;
    const r = (i % 2 ? 0.7 : 1) * radius * t;
    pixel(
      ctx,
      x + r * Math.cos(angle),
      y + r * Math.sin(angle) + 5 * t * t,
      i % 4 ? 2 : 3,
      colors[i % colors.length]!,
    );
  }
  ctx.restore();
}
function sparkField(ctx: CanvasRenderingContext2D, side: number, t: number) {
  // Как в исходной «Искре», оставляем лишь 4/9 пути до места остановки.
  const travel = 4 / 9;
  const stars: [number, number, number][] = side
    ? [
        [45, 37, 24],
        [81, 78, 39],
      ]
    : [
        [67, 49, 52],
        [100, 86, 23],
      ];
  stars.forEach(([x, y, width], i) => {
    const q = phase(t, 0.07 + i * 0.16 + side * 0.05, 0.86 + i * 0.1);
    sprite(
      ctx,
      layers[0],
      x + (side ? -14 : 14) * travel * (1 - q),
      y + 12 * travel * (1 - q),
      width * q,
    );
  });
}
function binary(ctx: CanvasRenderingContext2D, side: number, t: number) {
  const q = phase(t, 0.03, 0.94);
  const dir = side ? 1 : -1;
  const x = 72 + dir * 30 * (4 / 9) * q;
  const y = 65 - dir * 18 * (4 / 9) * q;
  for (let i = 0; i < 15 * q; i++) {
    const f = i / 14;
    pixel(
      ctx,
      72 + dir * (30 * f - 26) * (4 / 9),
      65 - dir * 8 * Math.sin(f * Math.PI),
      1,
      colors[i % 3]!,
    );
  }
  sprite(ctx, [side ? 2 : 1], x, y, (side ? 120 : 107) * q);
  sprite(ctx, [14], side ? 45 : 103, side ? 89 : 35, 20 * phase(t, 0.2, 0.96));
}
function comet(ctx: CanvasRenderingContext2D, side: number, t: number) {
  const q = phase(t, side ? 0.32 : 0.02, side ? 0.98 : 0.76);
  const x = 22 + 80 * q,
    y = 96 - 53 * q * q;
  for (let i = 0; i < Math.floor(23 * q); i++) {
    const f = i / 23;
    pixel(ctx, 12 + 82 * f, 101 - 54 * f * f + ((i % 3) - 1) * 2, i % 5 ? 1 : 2, colors[i % 3]!);
  }
  const size = side ? 99 : 83;
  sprite(
    ctx,
    layers[2],
    x,
    y,
    size * (0.6 + 0.4 * q) * phase(t, side ? 0.28 : 0, side ? 0.6 : 0.29),
  );
}
function orbit(ctx: CanvasRenderingContext2D, side: number, t: number) {
  const q = phase(t, 0, 0.98);
  const angle = tau * (0.12 + 0.76 * q + 0.5 * side);
  function position(a: number): [number, number] {
    return [72 + 49 * Math.cos(a), 63 + 22 * Math.sin(a) - 13 * Math.cos(a)];
  }
  for (let i = 0; i < 64 * q; i++) {
    const [x, y] = position((tau * i) / 64);
    pixel(ctx, x, y, 1, i % 4 ? '#b6b3cb' : '#eb913f');
  }
  const [x, y] = position(angle);
  if (!side) {
    sprite(ctx, layers[3], 72, 63 + 8 * (1 - q), 105 * q);
    sprite(ctx, [14], x, y, 18 * q);
  } else {
    sprite(ctx, layers[0], 72, 64, 58 * q);
    sprite(ctx, layers[3], x, y, 58 * q);
  }
}
function nova(ctx: CanvasRenderingContext2D, side: number, t: number) {
  const x = side ? 67 : 77,
    y = side ? 65 : 60;
  const bloom = phase(t, 0.14, 0.67);
  const width = side ? 94 : 110;
  sprite(ctx, [8], x, y, width * bloom);
  sprite(ctx, [9], x, y, width * (0.72 + 0.32 * Math.sin(Math.PI * bloom)) * phase(t, 0, 0.62));
  burst(ctx, x, y, phase(t, 0.2, 0.96), 26, 58);
  for (let i = 0; i < 6; i++) {
    const a = (i * tau) / 6 + 0.32;
    sprite(
      ctx,
      [14],
      x + 52 * Math.cos(a),
      y + 45 * Math.sin(a),
      (i % 2 ? 12 : 16) * phase(t, 0.37 + i * 0.035, 0.95),
    );
  }
}
export function drawFinale(card: HTMLCanvasElement, t: number) {
  const w = Math.round(card.clientWidth / 2),
    h = Math.round(card.clientHeight / 2);
  if (!w || !h) return;
  if (card.width !== w || card.height !== h) {
    card.width = w;
    card.height = h;
  }
  const ctx = card.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const unit = Math.min(w, h * 1.75);
  const narrow = card.clientWidth < 450;
  for (let i = 0; i < 124; i++) {
    const x = ((i * 263 + 43) % 991) / 991;
    const y = ((i * i * 19 + i * 49 + 67) % 983) / 983;
    pixel(ctx, x * w, y * h, 1, i % 4 ? '#c5c5d2' : '#d8ae69');
  }
  const open = phase(t, 0.06, 0.5);
  for (const side of [-1, 1]) {
    sprite(
      ctx,
      [13],
      w * 0.5 + side * (w * 0.1 + (w * 0.21 - w * 0.1) * open),
      h * (0.66 - 0.07 * open),
      unit * (narrow ? 0.37 : 0.32) * open,
      side === 1,
    );
  }
  const drop = phase(t, 0, 0.46);
  const settle = phase(t, 0.46, 0.56);
  sprite(
    ctx,
    layers[5],
    w * 0.5,
    h * (-0.18 + 0.68 * drop - 0.04 * settle),
    unit * (narrow ? 0.86 : 0.55) * (0.75 + 0.32 * drop - 0.07 * settle),
  );
  const stars: [number, number][] = [
    [0.13, 0.29],
    [0.87, 0.29],
    [0.1, 0.65],
    [0.9, 0.65],
    [0.32, 0.14],
    [0.68, 0.14],
    [0.24, 0.82],
    [0.76, 0.82],
    [0.06, 0.43],
    [0.94, 0.43],
  ];
  stars.forEach(([x, y], i) => {
    sprite(
      ctx,
      [14],
      w * x,
      h * y,
      unit * (i % 2 ? 0.09 : 0.13) * phase(t, i * 0.03, 0.35 + i * 0.03),
    );
  });
  for (const x of [0.17, 0.83]) {
    burst(ctx, w * x, h * 0.28, phase(t, 0.23, 0.61), 34, unit * 0.17);
    burst(ctx, w * x, h * 0.49, phase(t, 0.43, 0.81), 34, unit * 0.17);
  }
  for (let i = 0; i < 37; i++) {
    const delay = (i % 5) * 0.035;
    const q = phase(t, 0.43 + delay, 0.85 + delay);
    if (q === 0 || q === 1) continue;
    ctx.globalAlpha = Math.sin(Math.PI * q);
    const x = 0.03 + (0.94 * ((i * 11) % 37)) / 36;
    sprite(
      ctx,
      [14],
      w * x + 4 * Math.sin(i + q * 4),
      h * q * (0.65 + (i % 4) * 0.1),
      6 + (i % 4) * 2,
    );
  }
  ctx.globalAlpha = 1;
}
const paintScenes = [sparkField, binary, comet, orbit, nova] as const;
export function drawSide(
  ctx: CanvasRenderingContext2D,
  side: number,
  scene: AnswerScene,
  t: number,
) {
  ctx.clearRect(0, 0, 144, 126);
  sky(ctx, side, 24 + scene * 5);
  // Мелкие звёзды появляются волной и остаются в последнем кадре серии.
  const count = 5 + scene * 2;
  for (let i = 0; i < count; i++) {
    const angle = (tau * i) / count + 0.5 * side;
    const q = phase(t, 0.03 + (0.24 * i) / count, 0.72 + (0.22 * i) / count);
    const r = 43 + 12 * q;
    sprite(
      ctx,
      [14],
      72 + r * Math.cos(angle),
      62 + 0.84 * r * Math.sin(angle),
      (i % 3 ? 9 : 15) * q,
    );
  }
  paintScenes[scene](ctx, side, t);
}

export function drawPhone(
  canvas: HTMLCanvasElement,
  canvases: [HTMLCanvasElement, HTMLCanvasElement],
  seam: number,
  scene: AnswerScene,
  t: number,
) {
  const w = Math.round(canvas.clientWidth / 2),
    h = Math.round(canvas.clientHeight / 2);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  // Координаты в половинном разрешении дают крупный чёткий пиксель на экранах разной плотности.
  const count = 16 + scene * 4;
  for (let i = 0; i < count; i++) {
    const side = i % 2;
    const f = (Math.floor(i / 2) + 0.5 + side * 0.3) / Math.ceil(count / 2);
    const q = phase(t, 0.18 * f, 0.67 + 0.25 * f);
    const inset = 3 + ((i * 7) % 13) + 3 * Math.sin(f * tau + q);
    const x = side ? w - inset : inset;
    const y = h * f - (1 - q) * (scene < 2 ? 3 : 8);
    sprite(ctx, [14], x, y, (i % 4 ? 8 : 15) * q);
    pixel(ctx, x + 3, y + 5, 1, colors[i % 4]!);
  }
  // Центры крупных фигур выходят в просветы у краёв и между поверхностями карточек.
  const scale = Math.min(1.48, Math.max(1.03, w / 155));
  const anchors: [0 | 1, number, number][] = [
    [0, 10, seam / 2 + 3],
    [1, w - 10, 0.71 * h],
  ];
  // Совмещаем смысловой центр кадра (ядро кометы, планету, звезду) с полем у карточки.
  const centers = [
    [67, 49, 81, 78],
    [47, 75, 103, 41],
    [110, 38, 110, 38],
    [72, 63, 72, 63],
    [77, 60, 67, 65],
  ];
  const center = centers[scene]!;
  for (const [side, x, y] of anchors) {
    ctx.drawImage(
      canvases[side],
      Math.round(x - center[2 * side]! * scale),
      Math.round(y - center[2 * side + 1]! * scale),
      Math.round(144 * scale),
      Math.round(126 * scale),
    );
  }
  // Две группы над и под стопкой видны и на самом узком экране.
  for (const side of [0, 1]) {
    const q = phase(t, side * 0.13, 0.88 + side * 0.1);
    for (let i = 0; i < 4 + scene; i++) {
      const x = w * (side ? 0.67 : 0.33) + (i - 2) * 10;
      const y = (side ? h - 6 : 6) + 3 * Math.sin(i * 0.85 + side + q);
      sprite(ctx, [14], x, y, (i === 2 ? 23 : 7 + (i % 3) * 3) * q);
    }
  }
}
