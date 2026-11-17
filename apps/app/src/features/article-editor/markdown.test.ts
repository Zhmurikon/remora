import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema, openMarkdown, newTable } from './markdown';
import { editTable, leaveTable, navigateCell } from './table';

it('сохраняет исходники соседних блоков, ссылки на файлы и определения ссылок', () => {
  const before =
    '> **Коротко**\n> - Факт\n\n| $x$ | $y$ |\n| :- | -: |\n| 1 | 2 |\n\n~~~python\n  print(1)\n~~~\n\n![Схема](media:00000000-0000-0000-0000-000000000001)\n\n[Дальше][урок]';
  const source = before + '\n\n[урок]: https://example.org/2\n';
  const parsed = openMarkdown(source);
  const state = EditorState.create({ doc: parsed.doc });
  const changed = state.tr.insertText('Новый абзац', state.doc.content.size);
  const value = parsed.write(changed.doc);
  expect(value).toContain(before);
  expect(value).toContain('[урок]: https://example.org/2');
  expect(parsed.write(parsed.doc)).toBe(source);
});
it('сохраняет таблицу и формулу внутри цитаты после записи в Markdown', () => {
  const cell = schema.nodes.table_header!.create(null, schema.text('x | y'));
  const table = schema.nodes.table!.create(null, schema.nodes.table_row!.create(null, cell));
  const formula = schema.nodes.math_block!.create({ tex: 'P(X = x) = 1' });
  const doc = schema.topNodeType.create(
    null,
    schema.nodes.blockquote!.create(null, [table, formula]),
  );
  expect(openMarkdown(openMarkdown('').write(doc)).doc.eq(doc)).toBe(true);
});
it('добавляет строки и столбцы и переносит курсор между ячейками', () => {
  let state = EditorState.create({ doc: schema.topNodeType.create(null, newTable(2, 2)) });
  const dispatch = (tr: typeof state.tr) => {
    state = state.apply(tr);
  };
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3)).insertText('А'));
  editTable('addColumn')(state, dispatch);
  dispatch(state.tr.insertText('Б'));
  expect(state.doc.firstChild!.firstChild!.child(1).textContent).toBe('Б');
  editTable('addRow')(state, dispatch);
  expect(state.doc.firstChild!.childCount).toBe(3);
  navigateCell('next')(state, dispatch);
  dispatch(state.tr.insertText('В'));
  expect(state.doc.firstChild!.child(1).child(2).textContent).toBe('В');
  editTable('deleteRow')(state, dispatch);
  editTable('deleteColumn')(state, dispatch);
  expect(state.doc.firstChild!.childCount).toBe(2);
  expect(state.doc.firstChild!.firstChild!.childCount).toBe(2);
  leaveTable(state, dispatch);
  dispatch(state.tr.insertText('После таблицы'));
  expect(state.doc.lastChild!.type.name).toBe('paragraph');
  expect(state.doc.lastChild!.textContent).toBe('После таблицы');
});
