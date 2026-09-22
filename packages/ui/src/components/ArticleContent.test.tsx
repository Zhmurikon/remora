import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ArticleContent } from './ArticleContent';

describe('ArticleContent', () => {
  it('сдвигает уровень заголовков от headingLevel', () => {
    const { container } = render(<ArticleContent value="# Тема" headingLevel={2} />);
    expect(container.querySelector('h2')?.textContent).toBe('Тема');
  });

  it('рендерит эмфазу и строчный код', () => {
    const { container } = render(<ArticleContent value={'**жир** и `код`'} />);
    expect(container.querySelector('strong')?.textContent).toBe('жир');
    expect(container.querySelector('code')?.textContent).toBe('код');
  });

  it('рендерит списки, цитату и разделитель', () => {
    const { container } = render(<ArticleContent value={'- один\n- два\n\n> цитата\n\n---'} />);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('blockquote')?.textContent).toContain('цитата');
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('рендерит нумерованные и вложенные списки', () => {
    const { container } = render(<ArticleContent value={'1. раз\n2. два\n   - под'} />);
    expect(container.querySelector('ol')).not.toBeNull();
    expect(container.querySelector('ol li ul li')?.textContent).toContain('под');
  });

  it('рендерит таблицу в контейнере с прокруткой', () => {
    const { container } = render(
      <ArticleContent value={'| A | B |\n| --- | --- |\n| 1 | 2 |'} />,
    );
    expect(container.querySelector('.overflow-x-auto table')).not.toBeNull();
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
  });

  it('оставляет только http(s)/mailto ссылки с безопасными rel/target', () => {
    const { container } = render(
      <ArticleContent value={'[ok](https://a.ru) и [зло](javascript:alert(1))'} />,
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://a.ru');
    expect(links[0]?.getAttribute('rel')).toContain('noopener');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    // Опасная ссылка не превратилась в <a>, но текст сохранён.
    expect(container.textContent).toContain('зло');
  });

  it('не пропускает сырой HTML', () => {
    const { container } = render(
      <ArticleContent value={'<img src=x onerror=alert(1)><script>alert(2)</script>'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('рендерит выключную формулу через KaTeX', async () => {
    const { container } = render(<ArticleContent value={'$$a^2 + b^2 = c^2$$'} />);
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
  });

  it('рендерит строчную формулу через KaTeX', async () => {
    const { container } = render(<ArticleContent value={'Итог $E = mc^2$ верен'} />);
    await waitFor(() =>
      expect(container.querySelector('.rm-formula-inline .katex')).not.toBeNull(),
    );
  });

  it('не принимает знак валюты за формулу', () => {
    const { container } = render(<ArticleContent value={'Цена 5$ и 10$ за штуку'} />);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('5$');
  });

  it('показывает исходный код блока и подсвечивает его', async () => {
    const { container } = render(<ArticleContent value={'```python\nprint(1)\n```'} />);
    // Fallback виден сразу, а затем shiki заменяет его подсветкой.
    expect(container.textContent).toContain('print(1)');
    await waitFor(() => expect(container.querySelector('.shiki')).not.toBeNull());
  });

  it('рендерит блок формулы через ```math', async () => {
    const { container } = render(<ArticleContent value={'```math\n\\frac{1}{2}\n```'} />);
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
  });

  it('рендерит изображение media: из карты media', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const { container } = render(
      <ArticleContent
        value={`![Схема](media:${id})`}
        media={{ [id]: { url: 'blob:preview', width: 320, height: 200 } }}
      />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:preview');
    expect(img?.getAttribute('alt')).toBe('Схема');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('не рендерит внешние изображения и неизвестный media', () => {
    const { container } = render(
      <ArticleContent
        value={'![внешнее](https://e.com/x.png) ![нет карты](media:22222222-2222-4222-8222-222222222222)'}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
