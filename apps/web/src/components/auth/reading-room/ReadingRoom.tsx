'use client';

import { useEffect, useRef } from 'react';
import { startWeather } from './weather';
import { startObjects } from './objects';
import { startBooks } from './books';

export function ReadingRoom() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const stage = root.current;
    if (!stage) return;
    const controller = new AbortController();
    const { signal } = controller;
    startObjects(stage, signal);
    startBooks(stage, signal);
    startWeather(stage, signal);
    return () => controller.abort();
  }, []);

  return (
    <aside ref={root} className="reading-stage" aria-label="Читальный зал" data-lit="true">
      <svg
        className="scene"
        viewBox="0 0 800 800"
        role="img"
        aria-label="Читальный зал с плющом на книжной полке, лампой на столе и дождём за арочным окном."
      >
        <defs>
          <svg id="artwork" width="800" height="800" viewBox="0 0 1254 1254">
            <image href="/reading-room/room-off.webp" width="1254" height="1254" />
            <image
              id="warm-light"
              href="/reading-room/lamp-light.webp"
              x="0"
              y="510"
              width="733"
              height="714"
            />
          </svg>
          <filter
            id="breeze"
            x="42"
            y="10"
            width="201"
            height="400"
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href="/reading-room/ivy-sway.png"
              x="42"
              y="10"
              width="201"
              height="400"
              preserveAspectRatio="none"
              result="stemMap"
            />
            <feDisplacementMap
              id="stem-shift"
              in="SourceGraphic"
              in2="stemMap"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
              result="stems"
            />
            <feImage
              href="/reading-room/ivy-flutter.png"
              x="42"
              y="10"
              width="201"
              height="400"
              preserveAspectRatio="none"
              result="leafMap"
            />
            <feDisplacementMap
              id="leaf-shift"
              in="stems"
              in2="leafMap"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <filter
            id="pull"
            x="161"
            y="504"
            width="30"
            height="69"
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href="/reading-room/chain-pull.png"
              x="161"
              y="504"
              width="30"
              height="69"
              preserveAspectRatio="none"
              result="pullMap"
            />
            <feDisplacementMap
              id="chain-down"
              in="SourceGraphic"
              in2="pullMap"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
              result="pulled"
            />
            <feImage
              href="/reading-room/chain-swing.png"
              x="161"
              y="504"
              width="30"
              height="69"
              preserveAspectRatio="none"
              result="swingMap"
            />
            <feDisplacementMap
              id="chain-across"
              in="pulled"
              in2="swingMap"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
        <use href="#artwork" />
        <use id="ivy-effect" className="effect" href="#artwork" filter="url(#breeze)" />
        <use id="chain-effect" className="effect" href="#artwork" filter="url(#pull)" />
        <rect
          id="lamp-focus"
          className="focus-ring"
          x="78"
          y="402"
          width="156"
          height="252"
          rx="28"
        />
        <rect
          id="ivy-focus"
          className="focus-ring"
          x="52"
          y="12"
          width="188"
          height="391"
          rx="30"
        />
        <rect
          id="shelf-focus"
          className="focus-ring"
          x="644"
          y="200"
          width="139"
          height="440"
          rx="12"
        />
        <rect
          id="book-focus"
          className="focus-ring"
          x="146"
          y="608"
          width="289"
          height="94"
          rx="16"
        />
      </svg>
      <canvas id="rain" aria-hidden="true"></canvas>
      <canvas id="book-layer" aria-hidden="true"></canvas>
      <button
        type="button"
        className="hotspot"
        id="shelf"
        aria-label="Уронить книгу с правой полки на стол"
      ></button>
      <button
        type="button"
        className="hotspot"
        id="open-book"
        aria-label="Перелистнуть страницу раскрытой книги"
      ></button>
      <button
        type="button"
        className="hotspot"
        id="ivy"
        aria-label="Пошевелить листья плюща"
      ></button>
      <button
        type="button"
        className="hotspot"
        id="lamp"
        aria-label="Настольная лампа"
        aria-pressed="true"
      ></button>
      <button
        type="button"
        id="motion"
        className="reading-motion"
        aria-label="Приостановить анимацию"
        title="Приостановить анимацию"
        aria-pressed="false"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path className="pause-mark" d="M9 6v12m6-12v12" />
          <path className="play-mark" d="m9 6 9 6-9 6z" />
        </svg>
      </button>
    </aside>
  );
}
