'use client';

import { useEffect, useRef, type PointerEvent } from 'react';

const workbook = '/lecture-demo/news-test.webp';
const motionQuery =
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
const duration = 3420;
type Point = readonly [number, number];
const rest: Point = [155, 264];
const box: Point[] = [
  [96, 182],
  [119, 177],
  [124, 197],
  [100, 202],
  [96, 182],
];
const tick: Point[] = [
  [101, 187],
  [108, 192],
  [122, 174],
];

function pencilFrame(time: number, [x, y]: Point, angle: number, easing = 'linear'): Keyframe {
  return {
    offset: time / duration,
    transform: `translate(${x - rest[0]}px, ${y - rest[1]}px) rotate(${angle}deg)`,
    easing,
  };
}

// Длина сегмента определяет время хода: кончик грифеля всегда совпадает с концом штриха.
function traceFrames(points: Point[], start: number, lengthMs: number): Keyframe[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    const [prevX, prevY] = points[i - 1]!;
    distances.push(distances[i - 1]! + Math.hypot(x - prevX, y - prevY));
  }
  const length = distances[points.length - 1]!;
  return points.map((point, i) =>
    pencilFrame(start + (lengthMs * distances[i]!) / length, point, -12),
  );
}

const movement = [
  pencilFrame(0, rest, 0, 'ease-in-out'),
  ...traceFrames(box, 530, 710),
  ...traceFrames(tick, 1420, 400),
  pencilFrame(2070, [145, 184], -8, 'ease-in-out'),
  pencilFrame(2420, rest, 0),
  pencilFrame(duration, rest, 0),
];

function drawMark(path: SVGPolylineElement, start: number, end: number) {
  path.animate(
    [
      { opacity: 0, strokeDashoffset: 1, offset: 0 },
      { opacity: 1, strokeDashoffset: 1, offset: start / duration },
      { opacity: 1, strokeDashoffset: 0, offset: end / duration },
      { opacity: 1, strokeDashoffset: 0, offset: 3140 / duration },
      { opacity: 0, strokeDashoffset: 0, offset: 1 },
    ],
    duration,
  );
}

export function BlogDesk() {
  const scene = useRef<HTMLDivElement>(null);
  const pen = useRef<SVGGElement>(null);
  const square = useRef<SVGPolylineElement>(null);
  const check = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    const media = window.matchMedia(motionQuery);
    const illustration = scene.current;
    const stop = () =>
      illustration?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    media.addEventListener('change', stop);
    return () => {
      media.removeEventListener('change', stop);
      stop();
    };
  }, []);

  function write(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType === 'touch' ||
      !window.matchMedia(motionQuery).matches ||
      !pen.current ||
      !square.current ||
      !check.current ||
      pen.current.getAnimations().length
    )
      return;
    pen.current.animate(movement, duration);
    drawMark(square.current, 530, 1240);
    drawMark(check.current, 1420, 1820);
  }

  return (
    <div ref={scene} className="blog-desk-art" aria-hidden="true" onPointerEnter={write}>
      <img
        className="blog-desk-books"
        src="/lecture-demo/course-books.webp"
        width="347"
        height="462"
        alt=""
      />
      <svg className="blog-desk-workbook" viewBox="0 0 427 285" focusable="false">
        <defs>
          <clipPath id="blog-pencil-outline">
            <path d="M148 264 189 245 201 237 291 217 371 197Q394 190 399 215L400 225 413 221 412 231 357 248 214 276 149 280Z" />
          </clipPath>
          <mask id="blog-paper-mask">
            <rect width="427" height="285" fill="white" />
            <rect width="427" height="285" clipPath="url(#blog-pencil-outline)" fill="black" />
          </mask>
        </defs>
        <image href={workbook} width="427" height="285" mask="url(#blog-paper-mask)" />
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline
            ref={square}
            points={box.join(' ')}
            pathLength="1"
            strokeDasharray="1"
            opacity="0"
          />
          <polyline
            ref={check}
            points={tick.join(' ')}
            pathLength="1"
            strokeDasharray="1"
            opacity="0"
          />
        </g>
        <g ref={pen} className="blog-desk-pencil">
          <image href={workbook} width="427" height="285" clipPath="url(#blog-pencil-outline)" />
        </g>
      </svg>
    </div>
  );
}
