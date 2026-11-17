import { md, mediaId } from '@remora/ui/article-markdown';
import { Schema, type Node as DocNode, type NodeSpec } from 'prosemirror-model';
import {
  schema as common,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
} from 'prosemirror-markdown';

function formula(display: boolean): NodeSpec {
  const tag = display ? 'div' : 'span';
  return {
    group: display ? 'block' : 'inline',
    inline: !display,
    atom: true,
    attrs: { tex: { default: '' } },
    parseDOM: [
      { tag: tag + '[data-tex]', getAttrs: (el) => ({ tex: el.getAttribute('data-tex') }) },
    ],
    toDOM: (n) => [tag, { 'data-tex': n.attrs.tex, class: 'ae-math' }, n.attrs.tex],
  };
}
function cell(tag: 'th' | 'td'): NodeSpec {
  return {
    content: 'inline*',
    isolating: true,
    attrs: { align: { default: null } },
    parseDOM: [{ tag, getAttrs: (el) => ({ align: el.style.textAlign || null }) }],
    toDOM: (n) => [tag, { style: n.attrs.align ? 'text-align:' + n.attrs.align : null }, 0],
  };
}
export const schema: Schema = new Schema({
  nodes: common.spec.nodes
    .update('heading', { ...common.nodes.heading.spec, content: 'inline*' })
    .update('image', {
      ...common.nodes.image.spec,
      parseDOM: [
        {
          tag: '[data-media-src]',
          getAttrs: (el) => ({
            src: el.getAttribute('data-media-src'),
            alt: el.getAttribute('aria-label') || '',
          }),
        },
      ],
      toDOM: (n) => [
        'span',
        { 'data-media-src': n.attrs.src, 'aria-label': n.attrs.alt },
        n.attrs.alt || 'Изображение',
      ],
    })
    .append({
      math_inline: formula(false),
      math_block: formula(true),
      table: {
        group: 'block',
        content: 'table_row+',
        isolating: true,
        parseDOM: [{ tag: 'table' }],
        toDOM: () => ['table', ['tbody', 0]],
      },
      table_row: {
        content: '(table_header | table_cell)+',
        parseDOM: [{ tag: 'tr' }],
        toDOM: () => ['tr', 0],
      },
      table_header: cell('th'),
      table_cell: cell('td'),
    }),
  marks: common.spec.marks
    .update('link', {
      ...common.marks.link.spec,
      toDOM: (m) => [
        'a',
        { title: m.attrs.title, href: safeLink(m.attrs.href) ? m.attrs.href : null },
        0,
      ],
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (el) =>
            safeLink(el.getAttribute('href') || '')
              ? { href: el.getAttribute('href'), title: el.getAttribute('title') }
              : false,
        },
      ],
    })
    .append({ strike: { parseDOM: [{ tag: 'del' }, { tag: 's' }], toDOM: () => ['del', 0] } }),
});
export function safeLink(value: string) {
  return /^(https?:\/\/|mailto:)\S+$/i.test(value);
}
// ProseMirror типизирует markdown-it 14; для разбора использует только совместимый метод parse.
const parser = new MarkdownParser(schema, md as unknown as MarkdownParser['tokenizer'], {
  ...defaultMarkdownParser.tokens,
  s: { mark: 'strike' },
  math_inline: { node: 'math_inline', getAttrs: (t) => ({ tex: t.content }) },
  math_block: { node: 'math_block', getAttrs: (t) => ({ tex: t.content.trim() }) },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  td: {
    block: 'table_cell',
    getAttrs: (t) => ({ align: t.attrGet('style')?.split(':')[1] || null }),
  },
  th: {
    block: 'table_header',
    getAttrs: (t) => ({ align: t.attrGet('style')?.split(':')[1] || null }),
  },
});
const serializer: MarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    math_inline: (s, n) => s.write('$' + n.attrs.tex + '$'),
    math_block: (s, n) => {
      s.text('$$\n' + n.attrs.tex + '\n$$', false);
      s.closeBlock(n);
    },
    table: (state, node) => {
      node.forEach((row, _, index) => {
        const cells: string[] = [];
        const rules: string[] = [];
        row.forEach((c) => {
          const para = schema.nodes.paragraph!.create(null, c.content);
          const text = serializer.serialize(schema.topNodeType.create(null, para));
          cells.push(text.replace(/(?<!\\)\|/g, '\\|').replace(/\n/g, ' '));
          rules.push(
            ({ left: ':---', right: '---:', center: ':---:' } as Record<string, string>)[
              c.attrs.align
            ] ?? '---',
          );
        });
        state.write('| ' + cells.join(' | ') + ' |\n');
        if (index === 0) state.write('| ' + rules.join(' | ') + ' |\n');
      });
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  },
  { escapeExtraCharacters: /[$~]/g },
);

// Сохраняем исходную разметку нетронутых блоков, включая отступы Python и ссылки media:.
export function openMarkdown(source: string) {
  const doc = parser.parse(source);
  const blocks = md.parse(source, {}).filter((t) => t.level === 0 && t.map && t.nesting !== -1);
  const lines = source.split(/\r\n|\n|\r/);
  const raw = new WeakMap<DocNode, string>();
  const references: string[] = [];
  let last = 0;
  blocks.forEach((t, i) => {
    const [a, b] = t.map!;
    const gap = lines.slice(last, a).join('\n').trim();
    if (gap) references.push(gap);
    if (i < doc.childCount) raw.set(doc.child(i), lines.slice(a, b).join('\n').replace(/\n+$/, ''));
    last = b;
  });
  const tail = lines.slice(last).join('\n').trim();
  if (tail) references.push(tail);
  return {
    doc,
    write(next: DocNode) {
      if (next.eq(doc)) return source;
      const out: string[] = [];
      next.forEach((n) => {
        let block = raw.get(n);
        if (block === undefined) {
          block = serializer.serialize(schema.topNodeType.create(null, n));
          raw.set(n, block);
        }
        out.push(block);
      });
      return [...out, ...references].join('\n\n');
    },
  };
}
export function newTable(rows: number, cols: number) {
  return schema.nodes.table!.create(
    null,
    Array.from({ length: rows }, (_, r) =>
      schema.nodes.table_row!.create(
        null,
        Array.from({ length: cols }, () =>
          schema.nodes[r === 0 ? 'table_header' : 'table_cell']!.create(),
        ),
      ),
    ),
  );
}
export { mediaId };
