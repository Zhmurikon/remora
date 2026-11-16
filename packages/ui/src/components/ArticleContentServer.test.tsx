import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ArticleContentServer } from './ArticleContentServer';

it('рендерит теорию на сервере, заменяет media и не исполняет HTML', () => {
  const html = renderToStaticMarkup(
    <ArticleContentServer
      value={
        '# Тема\n\n![Схема](media:123e4567-e89b-12d3-a456-426614174000)\n\n<script>alert(1)</script>'
      }
      media={{
        '123e4567-e89b-12d3-a456-426614174000': { url: 'https://cdn.example/image.png' },
      }}
    />,
  );
  expect(html).toContain('<h3');
  expect(html).toContain('https://cdn.example/image.png');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

it('оборачивает широкую таблицу в область горизонтальной прокрутки', () => {
  const html = renderToStaticMarkup(
    <ArticleContentServer
      value={'| Термин | Значение |\n| --- | --- |\n| Интервал | Повторение |'}
    />,
  );

  expect(html).toContain('class="rm-table-scroll max-w-full overflow-x-auto"');
  expect(html).toContain('<table');
  expect(html).toContain('<th');
});

it('восстанавливает разделитель таблицы и сохраняет оператор внутри кода', () => {
  const value = '| Оператор | Описание | Результат |\n|---|---|\n| `|` | Или | **Да** |';
  const html = renderToStaticMarkup(<ArticleContentServer value={value} />);
  expect(html.match(/<th>/g)).toHaveLength(3);
  expect(html.match(/<td>/g)).toHaveLength(3);
  expect(html).toContain('>|</code>');
  expect(html).toContain('<strong>Да</strong>');
});

it('оставляет Markdown внутри выноски и ответа, а код в вопросе выводит безопасно', () => {
  const value =
    '> [!warning] Пример\n> - **Проверка**\n\n<details>\n<summary>Что делает <code>print()</code>?</summary>\n\nОтвет со *ссылкой* и <img src=x onerror=bad>.\n\n</details>';
  const html = renderToStaticMarkup(<ArticleContentServer value={value} />);
  expect(html).toContain('data-kind="warning"><strong>Пример</strong>');
  expect(html).toContain('<strong>Проверка</strong>');
  expect(html).toContain('<summary>Что делает <code>print()</code>?</summary>');
  expect(html).toContain('<em>ссылкой</em>');
  expect(html).toContain('&lt;img src=x onerror=bad&gt;');
});

it('не превращает примеры разметки, произвольный HTML и непарные теги в элементы', () => {
  const value =
    '\x60\x60\x60html\n<details><summary>Вопрос</summary>\n> [!info]\n</details>\n\x60\x60\x60\n\n<details onclick="bad()"><summary>HTML</summary>\n\n</details>\n\n<details><summary>Незакрытый вопрос</summary>';
  const html = renderToStaticMarkup(<ArticleContentServer value={value} />);
  expect(html).not.toContain('<details');
  expect(html).not.toContain('<summary');
  expect(html).toContain('[!info]');
  expect(html).toContain('Незакрытый вопрос');
});
