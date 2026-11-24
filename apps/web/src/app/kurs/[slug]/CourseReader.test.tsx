// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { CourseReader } from './CourseReader';

const articles = [
  { id: 'one', title: 'Первая статья' },
  { id: 'two', title: 'Вторая статья' },
];

function reader(items = articles) {
  return (
    <CourseReader
      top={null}
      course={{
        id: 'course',
        slug: 'sample',
        title: 'Курс',
        likesCount: 0,
        savesCount: 0,
        liked: false,
      }}
      coverDetails={null}
      sections={[
        {
          id: 'section',
          title: 'Раздел',
          articles: items.map((article) => ({
            ...article,
            setId: `set-${article.id}`,
            meta: 'Раздел',
            byline: 'Автор',
            content: <input aria-label="Ответ" />,
            hasCards: true,
            resources: (
              <h3 id={`article-${article.id}-cards`} tabIndex={-1}>
                Карточки
              </h3>
            ),
          })),
        },
      ]}
    />
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

it('публикует все статьи в HTML без JavaScript и убирает оглавление для одной статьи', () => {
  const html = renderToStaticMarkup(reader());
  expect(html).toContain('href="#article-two"');
  expect(html).toContain('id="article-one"');
  expect(html).toContain('id="article-two"');
  expect(html).not.toMatch(/<article[^>]*\shidden/);
  expect(renderToStaticMarkup(reader(articles.slice(0, 1)))).not.toContain('Оглавление курса');
});

it('открывает прямую ссылку и сохраняет состояние статьи при смене якоря', () => {
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
    expect(
      view.container.querySelector('.course-more a[href*="text_only"]')?.getAttribute('href'),
    ).toContain('?article=' + id + '&text_only=1');
    expect(view.getByRole('link', { name: 'Пройти квиз' }).getAttribute('href')).toMatch(
      new RegExp(`/sets/set-${id}/test\\?from=public-course$`),
    );
    expect(first.hidden).toBe(id !== 'one');
    expect(second.hidden).toBe(id !== 'two');
  }
  expect(second.querySelector('input')?.value).toBe('Текст');
});

it('открывает карточки нужного урока по прямой ссылке', () => {
  window.history.replaceState(null, '', '#article-two-cards');
  const view = render(reader());
  expect(view.container.querySelector<HTMLElement>('#article-one')?.hidden).toBe(true);
  expect(document.activeElement?.id).toBe('article-two-cards');
  expect(view.container.querySelector('.reader-tabs [aria-current]')?.textContent).toBe('Карточки');
});
