// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { CourseReader } from './CourseReader';

const articles = [
  { id: 'one', title: 'Первая статья' },
  { id: 'two', title: 'Вторая статья' },
];

function reader(items = articles) {
  return (
    <CourseReader sections={[{ id: 'section', title: 'Раздел', articles: items }]}>
      {items.map((article) => (
        <article key={article.id} id={`article-${article.id}`} className="course-material">
          <h2 className="course-material-title" tabIndex={-1}>
            {article.title}
          </h2>
          <input aria-label="Ответ" />
        </article>
      ))}
    </CourseReader>
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('публикует все статьи в HTML без JavaScript и убирает оглавление для одной статьи', () => {
  const html = renderToStaticMarkup(reader());
  expect(html).toContain('href="#article-two"');
  expect(html).toContain('id="article-one"');
  expect(html).toContain('id="article-two"');
  expect(html).not.toMatch(/<article[^>]*\shidden/);
  expect(renderToStaticMarkup(reader(articles.slice(0, 1)))).not.toContain('<nav');
});

it('открывает прямую ссылку и сохраняет состояние статьи при смене якоря', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    addEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.history.replaceState(null, '', '#article-two');
  const view = render(reader());
  const first = view.container.querySelector<HTMLElement>('#article-one')!;
  const second = view.container.querySelector<HTMLElement>('#article-two')!;
  expect(first.hidden).toBe(true);
  expect(second.hidden).toBe(false);
  expect(document.activeElement).toBe(second.querySelector('h2'));
  const answer = second.querySelector('input')!;
  fireEvent.change(answer, { target: { value: 'Текст' } });
  for (const id of ['one', 'two']) {
    window.history.replaceState(null, '', `#article-${id}`);
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(view.container.querySelector('[aria-current="location"]')?.getAttribute('href')).toBe(
      `#article-${id}`,
    );
    expect(first.hidden).toBe(id !== 'one');
    expect(second.hidden).toBe(id !== 'two');
  }
  expect(second.querySelector('input')?.value).toBe('Текст');
});
