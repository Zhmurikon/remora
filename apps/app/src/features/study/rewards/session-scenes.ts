import image from './finale-sprites.png';
import { phase, pixel } from './paint';

export const finaleAtlas = new Image();
finaleAtlas.src = image;

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function glint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const n = Math.round(r);
  if (n <= 0) return;
  rect(ctx, x - n, y, 2 * n + 1, 1, color);
  rect(ctx, x, y - n, 1, 2 * n + 1, color);
  if (n > 3) rect(ctx, x - 1, y - 1, 3, 3, color);
}
function skyField(ctx: CanvasRenderingContext2D, t: number) {
  for (let i = 0; i < 96; i++) {
    const x = (i * 79 + 17) % 240,
      y = (i * i * 29 + i * 17 + 3) % 133;
    pixel(ctx, x, y, 1, i % 4 ? '#a39686' : '#c9974b');
  }
  (
    [
      [25, 42],
      [51, 87],
      [194, 52],
      [211, 88],
      [70, 14],
      [161, 108],
      [179, 17],
    ] as const
  ).forEach(([x, y], i) => {
    const shimmer = Math.sin(phase(t, i * 0.055, 0.6 + i * 0.04) * Math.PI);
    glint(ctx, x, y, 2 + (i % 3) + 2 * shimmer, i % 3 ? '#d29345' : '#8992ae');
  });
}
function orbitPoint(angle: number): [number, number] {
  const u = 95 * Math.cos(angle),
    v = 95 * 0.44 * Math.sin(angle);
  return [123 + u * 0.94 + v * 0.34, 64 - u * 0.34 + v * 0.94];
}
function orbitScene(ctx: CanvasRenderingContext2D, t: number) {
  const flow = phase(t, 0, 1);
  for (let i = 0; i < 110; i++) {
    const [x, y] = orbitPoint((2 * Math.PI * i) / 110);
    pixel(ctx, x, y, 1, i < Math.round(110 * flow) ? '#c6a064' : '#a39686');
  }
  function satellite() {
    const angle = -2.6 + flow * 5.35;
    for (let i = 1; i <= 12; i++) {
      const [x, y] = orbitPoint(angle - i * 0.029);
      pixel(ctx, x, y, 1, i < 6 ? '#b58a45' : '#c6ae80');
    }
    const [x, y] = orbitPoint(angle);
    rect(ctx, x - 3, y - 2, 6, 5, '#4c586c');
    rect(ctx, x - 2, y - 3, 4, 2, '#b1c6d4');
    rect(ctx, x - 2, y - 1, 4, 2, '#f3d9a0');
    rect(ctx, x - 9, y - 1, 5, 3, '#718099');
    rect(ctx, x + 4, y - 1, 5, 3, '#718099');
    rect(ctx, x - 8, y - 2, 4, 1, '#b3c5cf');
    rect(ctx, x + 4, y - 2, 4, 1, '#b3c5cf');
    glint(ctx, x + 4, y - 4, Math.sin(Math.PI * phase(t, 0.72, 1)) * 4, '#ffce5d');
  }
  const yShift = Math.round(3 * (1 - phase(t, 0, 0.64)));
  ctx.save();
  ctx.translate(0, yShift);
  ctx.drawImage(finaleAtlas, 0, 0, 140, 80, 55, 25, 140, 80);
  satellite();
  ctx.restore();
}
function landingScene(ctx: CanvasRenderingContext2D, t: number) {
  ctx.drawImage(finaleAtlas, 0, 82, 240, 51, 0, 82, 240, 51);
  const descent = phase(t, 0.06, 0.76),
    landing = phase(t, 0.62, 0.92);
  const x = Math.round(117 + 8 * descent),
    y = Math.round(27 + 45 * descent + 2 * Math.sin(landing * Math.PI));
  const metal = '#514955',
    shade = '#8e7b7a';
  ctx.save();
  ctx.translate(x, y);
  const spread = phase(t, 0.24, 0.59);
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const xx = dir * (11 + i * (0.3 + 0.55 * spread)),
        yy = 7 + i * (0.7 + 0.52 * spread);
      rect(ctx, xx, yy, dir * 2, 2, metal);
      rect(ctx, dir * (6 + i * 1.04), 10 + i * 0.72, dir * 2, 1, shade);
    }
    rect(ctx, dir * (15 + 6 * spread) - 4, 16 + 7 * spread, 9, 2, metal);
  }
  const fire = (1 - phase(t, 0.53, 0.76)) * (0.85 + 0.15 * Math.sin(26 * t));
  if (fire > 0.02) {
    rect(ctx, -5, 13, 10, 12 * fire, '#cc844a');
    rect(ctx, -3, 14, 6, 15 * fire, '#ffd47c');
    rect(ctx, -1, 13, 2, 10 * fire, '#fff1b8');
  }
  ctx.drawImage(finaleAtlas, 160, 7, 40, 50, -20, -33, 40, 50);
  pixel(ctx, 8, -22, 3, t > 0.78 ? '#f0ae4e' : shade);
  ctx.restore();
  const dust = phase(t, 0.61, 0.98);
  if (dust > 0 && dust < 1) {
    ctx.save();
    ctx.globalAlpha = 0.85 * Math.sin(Math.PI * dust);
    for (let i = 0; i < 40; i++) {
      const a = i % 2 ? 1 : -1;
      pixel(
        ctx,
        x + a * (5 + (10 + (i % 19)) * dust),
        95 - Math.sin(Math.PI * dust) * (3 + (i % 8)) + (i % 3),
        1 + (i % 2),
        '#b99b7f',
      );
    }
    ctx.restore();
  }
  const beacon = phase(t, 0.75, 1);
  glint(ctx, x + 9, y - 22, 2 + 3 * Math.sin(beacon * Math.PI), '#efb65c');
}
export function drawSessionScene(
  canvas: HTMLCanvasElement,
  state: 'partial' | 'failed',
  t: number,
) {
  if (!finaleAtlas.naturalWidth) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = Math.max(1, Math.round(canvas.clientWidth / 2)),
    h = Math.max(1, Math.round(canvas.clientHeight / 2));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  const scale = Math.min(w / 240, h / 133);
  ctx.translate((w - 240 * scale) / 2, (h - 133 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  skyField(ctx, t);
  if (state === 'partial') orbitScene(ctx, t);
  else landingScene(ctx, t);
  ctx.restore();
}
