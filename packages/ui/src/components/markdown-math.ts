import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

// Формулы в теории: $…$ для строчных и $$…$$ для выключных.
// Плагин только размечает токены math_inline/math_block; рендер делает FormulaContent (KaTeX),
// поэтому здесь нет ни HTML, ни вызова katex — разметка и рендер разнесены намеренно.

// Знак доллара считается разделителем, только если он не окружён пробелом с нужной стороны,
// а закрывающий — ещё и не сливается с числом. Это отсекает цены вида «5$ и $10».
function delimiters(state: StateInline, pos: number): { canOpen: boolean; canClose: boolean } {
  const max = state.posMax;
  const prev = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const next = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;
  const nextIsDigit = next >= 0x30 && next <= 0x39;
  const prevIsSpace = prev === 0x20 || prev === 0x09;
  const nextIsSpace = next === 0x20 || next === 0x09;
  return { canOpen: !nextIsSpace, canClose: !prevIsSpace && !nextIsDigit };
}

function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== '$') return false;
  const open = delimiters(state, state.pos);
  if (!open.canOpen) {
    if (!silent) state.pending += '$';
    state.pos += 1;
    return true;
  }
  const start = state.pos + 1;
  let match = start;
  // Ищем закрывающий $, пропуская экранированные \$.
  for (;;) {
    match = state.src.indexOf('$', match);
    if (match === -1) break;
    let back = match - 1;
    while (state.src[back] === '\\') back -= 1;
    if ((match - back) % 2 === 1) break;
    match += 1;
  }
  if (match === -1) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (match - start === 0) {
    if (!silent) state.pending += '$$';
    state.pos = start + 1;
    return true;
  }
  if (!delimiters(state, match).canClose) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

function mathBlock(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  let pos = state.bMarks[start]! + state.tShift[start]!;
  let max = state.eMarks[start]!;
  if (pos + 2 > max || state.src.slice(pos, pos + 2) !== '$$') return false;
  if (silent) return true;
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  let found = false;
  let lastLine = '';
  if (firstLine.trim().endsWith('$$')) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  let next = start;
  while (!found) {
    next += 1;
    if (next >= end) break;
    pos = state.bMarks[next]! + state.tShift[next]!;
    max = state.eMarks[next]!;
    if (pos < max && state.tShift[next]! < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith('$$')) {
      const lastPos = state.src.slice(0, max).lastIndexOf('$$');
      lastLine = state.src.slice(pos, lastPos);
      found = true;
    }
  }
  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content =
    (firstLine.trim() ? `${firstLine}\n` : '') +
    state.getLines(start + 1, next, state.tShift[start]!, true) +
    (lastLine.trim() ? lastLine : '');
  token.markup = '$$';
  token.map = [start, state.line];
  return true;
}

export function markdownMath(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}
