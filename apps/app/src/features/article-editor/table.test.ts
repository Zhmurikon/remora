import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { newTable, openMarkdown, schema } from './markdown';
import { parsePastedMarkdown } from './markdown-input';

it('вставляет многострочный текст в текущую ячейку, сохраняя таблицу', () => {
  let state = EditorState.create({ doc: schema.topNodeType.create(null, newTable(2, 2)) });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  const next = state.tr.replaceSelection(
    parsePastedMarkdown('Первая\nВторая', state.selection.$from, false),
  ).doc;
  expect(next.childCount).toBe(1);
  expect(next.firstChild!.childCount).toBe(2);
  expect(next.firstChild!.firstChild!.childCount).toBe(2);
  expect(next.firstChild!.firstChild!.firstChild!.textContent).toContain('Вторая');
});

it.each(['\\|', '\\\\|', 'a | b', 'a \\| b'])(
  'сохраняет символы ячейки %s после открытия',
  (text) => {
    const cell = schema.nodes.table_header!.create(null, schema.text(text));
    const doc = schema.topNodeType.create(
      null,
      schema.nodes.table!.create(null, schema.nodes.table_row!.create(null, cell)),
    );
    const encoded = openMarkdown('').write(doc);
    expect(openMarkdown(encoded).doc.firstChild!.firstChild!.firstChild!.textContent).toBe(text);
  },
);

it.each(['code', 'math'])('сохраняет вертикальную черту внутри %s в таблице', (kind) => {
  const inline =
    kind === 'code'
      ? schema.text(String.raw`a \| b`, [schema.marks.code!.create()])
      : schema.nodes.math_inline!.create({ tex: String.raw`P(A\mid B) = |x|` });
  const cell = schema.nodes.table_header!.create(null, inline);
  const doc = schema.topNodeType.create(
    null,
    schema.nodes.table!.create(null, schema.nodes.table_row!.create(null, cell)),
  );
  expect(openMarkdown(openMarkdown('').write(doc)).doc.eq(doc)).toBe(true);
});
