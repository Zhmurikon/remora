import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { openMarkdown } from './markdown';
import { parsePastedMarkdown } from './markdown-input';

it('вставляет Markdown с заголовком и таблицей без потери структуры при сохранении', () => {
  const text = '### Пример\n\n**Вероятность** $p$\n\n| X | P |\n| --- | --- |\n| 1 | 0.5 |';
  const initial = openMarkdown('');
  const state = EditorState.create({ doc: initial.doc });
  const slice = parsePastedMarkdown(text, state.selection.$from, false);
  const pasted = state.tr.replaceSelection(slice).doc;
  expect(pasted.eq(openMarkdown(text).doc)).toBe(true);
  expect(openMarkdown(initial.write(pasted)).doc.eq(pasted)).toBe(true);
});

it('сохраняет Markdown буквальным текстом при вставке без форматирования', () => {
  const state = EditorState.create({ doc: openMarkdown('').doc });
  const slice = parsePastedMarkdown('### Пример\n**Текст**', state.selection.$from, true);
  const pasted = state.tr.replaceSelection(slice).doc;
  expect(pasted.firstChild!.type.name).toBe('paragraph');
  expect(pasted.textBetween(0, pasted.content.size, '\n')).toBe('### Пример\n**Текст**');
  expect(pasted.lastChild!.firstChild!.marks).toHaveLength(0);
});

it('обычный вставленный текст наследует жирное оформление окружающего абзаца', () => {
  const doc = openMarkdown('**Начало конца**').doc;
  const context = doc.resolve(5);
  const slice = parsePastedMarkdown('вставка', context, false);
  expect(slice.content.firstChild!.firstChild!.marks[0]!.type.name).toBe('strong');
});
