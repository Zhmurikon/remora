import { baseKeymap, chainCommands, exitCode, toggleMark } from 'prosemirror-commands';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, undo, redo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, Selection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import type { Node as DocNode } from 'prosemirror-model';
import type { ArticleMedia } from '@remora/ui';
import { articleFormula } from '@remora/ui/article-formula';
import { leaveTable, navigateCell } from './table';
import { schema, openMarkdown, mediaId } from './markdown';
import { markdownInputRules, parsePastedMarkdown } from './markdown-input';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-gapcursor/style/gapcursor.css';

export function makeView(
  host: HTMLElement,
  value: string,
  hooks: {
    locked: () => boolean;
    media: () => Record<string, ArticleMedia>;
    change: (value: string) => void;
    refresh: () => void;
    editFormula: () => void;
  },
) {
  const parsed = openMarkdown(value);
  const item = schema.nodes.list_item!;
  function mathView(n: DocNode) {
    const display = n.type.name === 'math_block';
    const dom = document.createElement(display ? 'div' : 'span');
    dom.className = 'ae-math';
    dom.dataset.tex = n.attrs.tex;
    dom.title = 'Изменить формулу';
    dom.innerHTML = articleFormula(n.attrs.tex, display);
    return { dom, ignoreMutation: () => true };
  }
  const view = new EditorView(host, {
    editable: () => !hooks.locked(),
    attributes: (state) => ({
      class: 'course-article',
      'data-empty': String(
        state.doc.childCount === 1 &&
          state.doc.firstChild!.isTextblock &&
          state.doc.firstChild!.content.size === 0,
      ),
      'aria-placeholder': 'Начните писать здесь',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Теория статьи',
      spellcheck: 'true',
      lang: 'ru',
    }),
    state: EditorState.create({
      doc: parsed.doc,
      plugins: [
        history(),
        markdownInputRules(),
        keymap({
          'Mod-End': (state, dispatch) => {
            dispatch?.(state.tr.setSelection(Selection.atEnd(state.doc)).scrollIntoView());
            return true;
          },
          'Mod-Home': (state, dispatch) => {
            dispatch?.(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView());
            return true;
          },
          Backspace: undoInputRule,
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          'Mod-y': redo,
          'Mod-b': toggleMark(schema.marks.strong!),
          'Mod-i': toggleMark(schema.marks.em!),
          Enter: chainCommands(navigateCell('down'), splitListItem(item)),
          'Mod-Enter': chainCommands(leaveTable, exitCode),
          'Shift-Enter': chainCommands(navigateCell('down'), exitCode, (s, d) => {
            d?.(s.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
            return true;
          }),
          Tab: chainCommands(navigateCell('next'), sinkListItem(item)),
          'Shift-Tab': chainCommands(navigateCell('previous'), liftListItem(item)),
        }),
        keymap(baseKeymap),
        gapCursor(),
      ],
    }),
    clipboardTextParser: parsePastedMarkdown,
    decorations(state) {
      const summaries: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        const first = node.firstChild;
        if (
          node.type.name === 'blockquote' &&
          first?.type.name === 'paragraph' &&
          first.childCount === 1 &&
          first.textContent === 'Коротко' &&
          first.firstChild?.marks.some((mark) => mark.type.name === 'strong')
        )
          summaries.push(Decoration.node(pos, pos + node.nodeSize, { class: 'article-summary' }));
      });
      return DecorationSet.create(state.doc, summaries);
    },
    nodeViews: {
      math_block: mathView,
      math_inline: mathView,
      image(n) {
        const dom = document.createElement('span');
        dom.className = 'ae-media';
        dom.dataset.mediaSrc = n.attrs.src;
        dom.setAttribute('aria-label', n.attrs.alt || 'Изображение');
        const id = mediaId(n.attrs.src),
          asset = id ? hooks.media()[id] : undefined;
        if (asset) {
          const img = document.createElement('img');
          img.alt = n.attrs.alt || '';
          img.src = asset.url;
          dom.append(img);
        } else dom.textContent = n.attrs.alt || 'Изображение недоступно';
        return { dom };
      },
    },
    handleClickOn(view, _pos, node, nodePos, _event, direct) {
      if (!direct || !['math_block', 'math_inline'].includes(node.type.name) || hooks.locked())
        return false;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
      hooks.editFormula();
      return true;
    },
    dispatchTransaction(tr) {
      if (
        tr.docChanged &&
        hooks.locked() &&
        !tr.getMeta('uploadedImage') &&
        !tr.getMeta('external')
      )
        return;
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged && !tr.getMeta('external')) hooks.change(parsed.write(next.doc));
      hooks.refresh();
    },
  });
  return view;
}
