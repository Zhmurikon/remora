'use client';

import { useEffect, useRef, useState } from 'react';

export default function ArticleDiagram({ value }: { value: string }) {
  const figure = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    if (!figure.current || !window.IntersectionObserver) {
      setNearby(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(figure.current);
    return () => observer.disconnect();
  }, []);
  const [image, setImage] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => {
    const element = figure.current;
    if (!element || !nearby) return;
    let generation = 0;
    const draw = async () => {
      const current = ++generation;
      const style = getComputedStyle(element);
      const color = (name: string) => `rgb(${style.getPropertyValue('--rm-' + name).trim()})`;
      try {
        const { renderMermaidSVGAsync } = await import('beautiful-mermaid');
        if (generation !== current) return;
        const svg = await renderMermaidSVGAsync(value, {
          bg: color('surface'),
          fg: color('fg'),
          line: color('fg-muted'),
          accent: color('primary'),
          surface: color('surface-muted'),
          border: color('border'),
          font: 'Arial',
          padding: 16,
        });
        // SVG загружается как изображение: разметка автора изолирована от DOM кабинета.
        if (generation === current)
          setImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      } catch {
        if (generation === current) setImage('');
      }
    };
    void draw();
    const themes = new MutationObserver(() => void draw());
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    system?.addEventListener('change', draw);
    return () => {
      generation++;
      themes.disconnect();
      system?.removeEventListener('change', draw);
    };
  }, [value, nearby]);
  return (
    <figure className="article-diagram" ref={figure}>
      {image && (
        <div
          className="article-diagram-scroll"
          tabIndex={enlarged ? 0 : undefined}
          aria-label="Схема урока"
        >
          <img
            src={image}
            alt="Схема урока. Текст связей доступен под схемой."
            data-enlarged={enlarged}
          />
        </div>
      )}
      {image && (
        <button type="button" aria-pressed={enlarged} onClick={() => setEnlarged(!enlarged)}>
          {enlarged ? 'Вся схема' : 'Увеличить схему'}
        </button>
      )}
      {image ? (
        <details>
          <summary>Исходный текст схемы</summary>
          <pre>{value}</pre>
        </details>
      ) : (
        <pre>{value}</pre>
      )}
    </figure>
  );
}
