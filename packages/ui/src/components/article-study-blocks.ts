import type { MarkdownIt, StateBlock } from 'markdown-it';

const labels = {
  abstract: 'Коротко',
  important: 'Важно',
  warning: 'Обратите внимание',
  info: 'Уточнение',
  tip: 'Подсказка',
};

function lineAt(state: StateBlock, line: number) {
  return state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]!).trimEnd();
}

// В старых конспектах встречаются короткий разделитель и оператор | внутри кода.
// Приводим только такие таблицы к GFM, затем их разбирает штатное правило markdown-it.
function importedTable(state: StateBlock, start: number, end: number, silent: boolean) {
  if (start + 2 >= end || state.sCount[start]! - state.blkIndent >= 4) return false;
  const header = lineAt(state, start);
  if (!header.startsWith('|') || !header.endsWith('|')) return false;
  const separator = lineAt(state, start + 1);
  if (!/^\|(?:\s*:?-+:?\s*\|)+$/.test(separator)) return false;
  const rows = [header, separator];
  let next = start + 2;
  while (next < end) {
    const line = lineAt(state, next);
    if (!line.startsWith('|') || !line.endsWith('|')) break;
    rows.push(line);
    next++;
  }
  if (rows.length < 3) return false;
  const normalized = rows.map((row) =>
    row.replace(/(?<![\\`])(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (span) =>
      span.replace(/(?<!\\)\|/g, '\\|'),
    ),
  );
  const width = (row: string) => row.split(/(?<!\\)\|/).length - 2;
  const columns = width(normalized[0]!);
  const missing = columns - width(separator);
  if (missing > 0 && normalized.slice(2).every((row) => width(row) === columns)) {
    normalized[1] = separator + '---|'.repeat(missing);
  }
  if (normalized.every((row, i) => row === rows[i])) return false;
  if (!silent) {
    const token = state.push('study_table', '', 0);
    token.content = normalized.join('\n');
    token.map = [start, next];
    state.line = next;
  }
  return true;
}

// Маркеры внутри блоков кода сюда не попадают. Непарные маркеры выводятся как текст.
function disclosureMarker(state: StateBlock, start: number, end: number, silent: boolean) {
  if (state.sCount[start]! - state.blkIndent >= 4) return false;
  let line = lineAt(state, start);
  let next = start + 1;
  if (line === '<details>' && next < end) line += lineAt(state, next++);
  const opening = line.match(/^<details>\s*<summary>(.+)<\/summary>$/);
  if (!opening && line !== '</details>') return false;
  if (!silent) {
    const token = state.push('study_marker', '', 0);
    token.content = opening?.[1] ?? '';
    token.markup = line;
    state.line = next;
  }
  return true;
}

export function articleStudyBlocks(md: MarkdownIt) {
  md.block.ruler.before('table', 'study_table', importedTable, { alt: ['paragraph'] });
  md.renderer.rules.study_table = (tokens, i, _options, env) => md.render(tokens[i]!.content, env);
  md.block.ruler.before('paragraph', 'study_marker', disclosureMarker, { alt: ['paragraph'] });
  md.core.ruler.before('inline', 'study_blocks', (state) => {
    const pending: typeof state.tokens = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]!;
      // Закрытие списка или цитаты ограничивает область парных маркеров.
      while (pending.length && pending[pending.length - 1]!.level > token.level) pending.pop();
      if (token.type === 'study_marker') {
        if (token.content) pending.push(token);
        else if (pending.length && pending[pending.length - 1]!.level === token.level) {
          pending.pop()!.type = 'study_details_open';
          token.type = 'study_details_close';
        }
      }
      if (token.type !== 'blockquote_open') continue;
      const first = state.tokens[i + 2];
      if (first?.type !== 'inline' || state.tokens[i + 1]?.type !== 'paragraph_open') continue;
      const marker = first.content.match(
        /^\[!(abstract|important|warning|info|tip)\][ \t]*([^\n]*)(?:\n|$)/i,
      );
      if (!marker) continue;
      const kind = marker[1]!.toLowerCase() as keyof typeof labels;
      token.type = 'study_callout';
      token.markup = kind;
      token.content = marker[2] || labels[kind];
      first.content = first.content.slice(marker[0].length);
      if (!first.content) state.tokens.splice(i + 1, 3);
    }
  });
  const esc = md.utils.escapeHtml;
  md.renderer.rules.study_marker = (tokens, i) => '<p>' + esc(tokens[i]!.markup) + '</p>\n';
  md.renderer.rules.study_details_open = (tokens, i) => {
    const title = esc(tokens[i]!.content).replace(
      /&lt;code&gt;(.+?)&lt;\/code&gt;/g,
      '<code>$1</code>',
    );
    return '<details class="rm-study-question"><summary>' + title + '</summary>\n';
  };
  md.renderer.rules.study_details_close = () => '</details>\n';
  md.renderer.rules.study_callout = (tokens, i) => {
    const { markup: kind, content: title } = tokens[i]!;
    return (
      '<blockquote class="rm-study-note" data-kind="' +
      kind +
      '"><strong>' +
      esc(title) +
      '</strong>\n'
    );
  };
}
