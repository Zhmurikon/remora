import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ArticleContentServer } from './ArticleContentServer';

it('рендерит теорию на сервере, заменяет media и не исполняет HTML', () => {
  const html = renderToStaticMarkup(
    <ArticleContentServer
      value={'# Тема\n\n![Схема](media:123e4567-e89b-12d3-a456-426614174000)\n\n<script>alert(1)</script>'}
      media={{
        '123e4567-e89b-12d3-a456-426614174000': { url: 'https://cdn.example/image.png' },
      }}
    />,
  );
  expect(html).toContain('<h3')
  expect(html).toContain('https://cdn.example/image.png')
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
});
