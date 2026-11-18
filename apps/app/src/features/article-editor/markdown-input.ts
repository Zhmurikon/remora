import { Fragment, Slice, type ResolvedPos } from 'prosemirror-model';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { openMarkdown, schema } from './markdown';

export function markdownInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6}) $/, schema.nodes.heading!, (match) => ({
        level: match[1]!.length,
      })),
      wrappingInputRule(/^> $/, schema.nodes.blockquote!),
      wrappingInputRule(/^[-+*] $/, schema.nodes.bullet_list!),
      wrappingInputRule(
        /^(\d+)\. $/,
        schema.nodes.ordered_list!,
        (match) => ({ order: Number(match[1]) }),
        (match, node) => node.childCount + node.attrs.order === Number(match[1]),
      ),
      textblockTypeInputRule(/^`{3}([\w+-]*) $/, schema.nodes.code_block!, (match) => ({
        params: match[1] ?? '',
      })),
    ],
  });
}

export function parsePastedMarkdown(text: string, context: ResolvedPos, plain: boolean): Slice {
  const doc = plain ? null : openMarkdown(text).doc;
  let formatted = false;
  doc?.descendants((node) => {
    if (!['paragraph', 'text'].includes(node.type.name) || node.marks.length) formatted = true;
  });
  if (['table_header', 'table_cell'].includes(context.parent.type.name)) {
    if (
      formatted &&
      !/[\r\n]/.test(text) &&
      doc?.childCount === 1 &&
      doc.firstChild!.type.name === 'paragraph'
    )
      return new Slice(doc.firstChild!.content, 0, 0);
    // Markdown-таблица хранит одну строку на ячейку, поэтому переносы превращаем в пробелы.
    const line = text.replace(/\r\n?|\n/g, ' ');
    return new Slice(Fragment.from(line ? schema.text(line, context.marks()) : null), 0, 0);
  }
  // Обычный текст наследует оформление позиции вставки.
  if (!formatted || plain) {
    const paragraphs = text
      .split(/(?:\r\n?|\n)+/)
      .map((line) =>
        schema.nodes.paragraph!.create(null, line ? schema.text(line, context.marks()) : undefined),
      );
    return Slice.maxOpen(Fragment.fromArray(paragraphs));
  }
  return Slice.maxOpen(doc!.content);
}
