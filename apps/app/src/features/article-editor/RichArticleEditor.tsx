import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';
import { NodeSelection, TextSelection, type Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ArticleMedia } from '@remora/ui';
import { articleFormula } from '@remora/ui/article-formula';
import { CourseIcon } from '../../components/CourseAction';
import { schema, newTable, safeLink, openMarkdown } from './markdown';
import { activeCell, editTable } from './table';
import { makeView } from './editor-view';
import { EditorPopover } from './EditorPopover';
import { uploadImage } from './upload';

type Tool = 'style' | 'table' | 'formula' | 'link' | 'code' | 'insert';
type Popup = { tool: Tool; anchor: HTMLElement };
const names: Record<Tool, string> = {
  style: 'Стиль абзаца',
  table: 'Вставить таблицу',
  formula: 'Формула',
  link: 'Ссылка',
  code: 'Блок кода',
  insert: 'Вставить блок',
};
type Props = {
  value: string;
  onChange: (s: string) => void;
  media: Record<string, ArticleMedia>;
  onImage: (id: string, m: ArticleMedia) => void;
  busy: boolean;
  onUploading: (b: boolean) => void;
};
export function RichArticleEditor(props: Props) {
  const pendingMedia = useRef<Record<string, ArticleMedia>>({});
  const latest = useRef(props);
  latest.current = props;
  const host = useRef<HTMLDivElement>(null),
    viewRef = useRef<EditorView | null>(null),
    file = useRef<HTMLInputElement>(null),
    formulaBtn = useRef<HTMLButtonElement>(null);
  const [, refresh] = useState(0),
    [popup, setPopup] = useState<Popup | null>(null),
    [input, setInput] = useState(''),
    [display, setDisplay] = useState(true),
    [caption, setCaption] = useState(''),
    [lang, setLang] = useState(''),
    [size, setSize] = useState([2, 4]),
    [error, setError] = useState('');
  const recorded = useRef(props.value);
  function open(tool: Tool, anchor: HTMLElement) {
    const view = viewRef.current;
    if (!view) return;
    const cursor = view.state.selection.$from;
    if (tool === 'code' && cursor.parent.type === schema.nodes.code_block) {
      view.dispatch(
        view.state.tr.setSelection(NodeSelection.create(view.state.doc, cursor.before())),
      );
    }
    if (tool === 'link' && view.state.selection.empty) {
      const link =
        schema.marks.link!.isInSet(cursor.marks()) ??
        cursor.nodeAfter?.marks.find((m) => m.type === schema.marks.link);
      if (link) {
        let begin = cursor.index(),
          end = begin;
        while (begin > 0 && link.isInSet(cursor.parent.child(begin - 1).marks)) begin--;
        while (end < cursor.parent.childCount && link.isInSet(cursor.parent.child(end).marks))
          end++;
        let pos = cursor.start();
        for (let i = 0; i < begin; i++) pos += cursor.parent.child(i).nodeSize;
        let stop = pos;
        for (let i = begin; i < end; i++) stop += cursor.parent.child(i).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, stop)));
      }
    }
    const { selection, doc } = view.state;
    const node = selection instanceof NodeSelection ? selection.node : null;
    const selected = doc.textBetween(selection.from, selection.to, '\n');
    const link =
      view.state.schema.marks.link!.isInSet(selection.$from.marks()) ??
      selection.$from.nodeAfter?.marks.find((m) => m.type.name === 'link');
    setInput(
      tool === 'formula'
        ? (node?.attrs.tex ?? selected)
        : tool === 'code'
          ? selected
          : tool === 'link'
            ? (link?.attrs.href ?? '')
            : '',
    );
    setCaption(selected);
    setDisplay(node ? node.type.name !== 'math_inline' : !activeCell(view.state));
    setLang(node && node.type === schema.nodes.code_block ? node.attrs.params : '');
    setError('');
    setPopup({ tool, anchor });
  }
  useLayoutEffect(() => {
    const api = makeView(host.current!, latest.current.value, {
      locked: () => latest.current.busy,
      media: () => ({ ...pendingMedia.current, ...latest.current.media }),
      refresh: () => refresh((n) => n + 1),
      change: (s) => {
        recorded.current = s;
        latest.current.onChange(s);
      },
      editFormula: () => {
        if (formulaBtn.current) open('formula', formulaBtn.current);
      },
    });
    viewRef.current = api;
    recorded.current = latest.current.value;
    refresh((n) => n + 1);
    return () => {
      api.destroy();
      viewRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    viewRef.current?.setProps({ editable: () => !props.busy });
  }, [props.busy]);
  useLayoutEffect(() => {
    if (recorded.current !== props.value) {
      // Сервер может нормализовать текст после сохранения. Синхронизируем только внешний ответ.
      const parsed = openMarkdown(props.value);
      const view = viewRef.current;
      if (view && !view.state.doc.eq(parsed.doc)) {
        view.dispatch(
          view.state.tr
            .replaceWith(0, view.state.doc.content.size, parsed.doc.content)
            .setMeta('external', true),
        );
      }
      recorded.current = props.value;
    }
  }, [props.value]);
  const view = viewRef.current,
    state = view?.state;
  const selection = state?.selection;
  const parent = selection?.$from.parent;
  const level = parent?.type.name === 'heading' ? Number(parent.attrs.level) : 0;
  const styleLabel = level ? 'Заголовок ' + level : 'Обычный текст';
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    function locate() {
      const v = viewRef.current,
        sel = window.getSelection();
      if (
        !v ||
        !v.hasFocus() ||
        !sel?.rangeCount ||
        sel.isCollapsed ||
        !v.dom.contains(sel.anchorNode) ||
        v.state.selection.empty
      ) {
        setBubble(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect?.();
      if (rect?.width && rect.top > 55 && rect.top < innerHeight)
        setBubble({
          x: Math.min(innerWidth - 128, Math.max(6, rect.left + rect.width / 2 - 60)),
          y: rect.top - 48,
        });
      else setBubble(null);
    }
    document.addEventListener('selectionchange', locate);
    window.addEventListener('scroll', locate, true);
    return () => {
      document.removeEventListener('selectionchange', locate);
      window.removeEventListener('scroll', locate, true);
    };
  }, []);
  function finish() {
    setPopup(null);
    view?.focus();
  }
  function run(command: Command) {
    if (!view || props.busy) return;
    command(view.state, view.dispatch, view);
    finish();
  }
  function insert(n: ReturnType<typeof schema.node>) {
    if (!view || props.busy) return;
    const currentCell = activeCell(view.state);
    const after = currentCell ? currentCell.pos + currentCell.table.nodeSize : null;
    const tr =
      n.isBlock && after !== null
        ? view.state.tr.insert(after, n)
        : view.state.tr.replaceSelectionWith(n, false);
    if (n.isBlock && after !== null) tr.setSelection(NodeSelection.create(tr.doc, after));

    if (n.type === schema.nodes.table) {
      const end = tr.selection.to;
      const from = after ?? tr.mapping.map(view.state.selection.from, -1);
      let first: number | null = null;
      tr.doc.nodesBetween(
        from,
        Math.min(tr.doc.content.size, Math.max(end, from + n.nodeSize)),
        (child, pos) => {
          if (first === null && child.type.name === 'table_header') first = pos + 1;
        },
      );
      if (first !== null) tr.setSelection(TextSelection.create(tr.doc, first));
    }
    view.dispatch(tr.scrollIntoView());
    finish();
  }
  function block(kind: 'blockquote' | 'bullet_list' | 'ordered_list') {
    if (!selection) return;
    const { $from } = selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === kind) {
        run(kind === 'blockquote' ? lift : liftListItem(schema.nodes.list_item!));
        return;
      }
    }
    run(kind === 'blockquote' ? wrapIn(schema.nodes.blockquote!) : wrapInList(schema.nodes[kind]!));
  }
  function applyLink() {
    if (!view || !safeLink(input.trim())) {
      setError('Укажите адрес с https://, http:// или mailto:.');
      return;
    }
    const { from, to } = view.state.selection;
    const text = caption || input.trim();
    const tr = view.state.tr;
    if (from === to || caption !== view.state.doc.textBetween(from, to, '\n'))
      tr.insertText(text, from, to);
    tr.addMark(
      from,
      from + (tr.docChanged ? text.length : to - from),
      schema.marks.link!.create({ href: input.trim() }),
    );
    view.dispatch(tr);
    finish();
  }
  async function addImage(f: File) {
    const current = viewRef.current;
    if (!current || latest.current.busy) return;
    latest.current.onUploading(true);
    setError('');
    setPopup(null);
    try {
      const { id, media } = await uploadImage(f);
      if (current.isDestroyed) return;
      pendingMedia.current[id] = media;
      latest.current.onImage(id, media);
      // Асинхронная загрузка блокирует ввод, чтобы картинка встала в выбранное место.
      const tr = current.state.tr
        .replaceSelectionWith(
          schema.nodes.image!.create({ src: 'media:' + id, alt: f.name }),
          false,
        )
        .setMeta('uploadedImage', true);
      current.dispatch(tr.scrollIntoView());
      current.focus();
    } catch {
      if (!current.isDestroyed) setError('Не удалось загрузить изображение. Попробуйте ещё раз.');
    } finally {
      if (!current.isDestroyed) latest.current.onUploading(false);
    }
  }
  function tool(
    label: string,
    icon: ReactNode,
    action: () => void,
    disabled = false,
    pressed?: boolean,
  ) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled || props.busy}
        aria-pressed={pressed}
        onMouseDown={(e) => e.preventDefault()}
        onClick={action}
      >
        {icon}
      </button>
    );
  }
  function markActive(name: 'strong' | 'em') {
    return (
      !!state &&
      !!selection &&
      (selection.empty
        ? !!schema.marks[name]!.isInSet(state.storedMarks ?? selection.$from.marks())
        : state.doc.rangeHasMark(selection.from, selection.to, schema.marks[name]!))
    );
  }
  const bold = () =>
    tool(
      'Полужирный',
      <b>B</b>,
      () => run(toggleMark(schema.marks.strong!)),
      !state || !toggleMark(schema.marks.strong!)(state),
      markActive('strong'),
    );
  const italic = () =>
    tool(
      'Курсив',
      <i>I</i>,
      () => run(toggleMark(schema.marks.em!)),
      !state || !toggleMark(schema.marks.em!)(state),
      markActive('em'),
    );
  function opener(key: Tool, children: ReactNode, label = names[key]) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={popup?.tool === key}
        disabled={props.busy || (key === 'style' && !!state && !!activeCell(state))}
        ref={key === 'formula' ? formulaBtn : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => (popup?.tool === key ? finish() : open(key, e.currentTarget))}
      >
        {children}
      </button>
    );
  }
  return (
    <div className="ae-rich">
      <div className="ae-toolbar" role="toolbar" aria-label="Форматирование статьи">
        <div>
          {opener(
            'style',
            <>
              <span>¶</span>
              {styleLabel}
              <span>⌄</span>
            </>,
          )}
        </div>
        <div>
          {bold()}
          {italic()}
          {opener('link', <CourseIcon name="link" />)}
        </div>
        <div>
          {tool('Маркированный список', <CourseIcon name="bullet" />, () => block('bullet_list'))}
          {tool('Нумерованный список', <CourseIcon name="ordered" />, () => block('ordered_list'))}
          {tool('Цитата', <span className="ae-quote">“</span>, () => block('blockquote'))}
        </div>
        <div>
          {opener(
            'table',
            <>
              <CourseIcon name="table" />
              <span>Таблица</span>
            </>,
          )}
          {tool(
            'Вставить изображение',
            <>
              <CourseIcon name="image" />
              <span>Изображение</span>
            </>,
            () => file.current?.click(),
          )}
          {opener(
            'formula',
            <>
              <span>∑</span>
              <span>Формула</span>
            </>,
          )}
          {opener('code', <CourseIcon name="code" />)}
        </div>
        <div>
          {tool(
            'Отменить',
            <CourseIcon name="undo" />,
            () => run(undo),
            !state || undoDepth(state) === 0,
          )}
          {tool(
            'Повторить',
            <CourseIcon name="redo" />,
            () => run(redo),
            !state || redoDepth(state) === 0,
          )}
        </div>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) void addImage(selected);
          e.target.value = '';
        }}
      />
      {error && !popup && <p role="alert">{error}</p>}
      <div className="ae-paper">
        <div className="ae-insert">{opener('insert', <span>＋</span>)}</div>
        <div ref={host} />
      </div>
      {bubble && !popup && !props.busy && (
        <div className="ae-bubble" style={{ left: bubble.x, top: bubble.y }}>
          {bold()}
          {italic()}
          {opener('link', <CourseIcon name="link" />)}
        </div>
      )}
      {popup && (
        <EditorPopover anchor={popup.anchor} label={names[popup.tool]} close={() => setPopup(null)}>
          {popup.tool === 'style' &&
            Array.from({ length: 7 }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === level}
                onClick={() =>
                  run(
                    setBlockType(
                      i ? schema.nodes.heading! : schema.nodes.paragraph!,
                      i ? { level: i } : undefined,
                    ),
                  )
                }
              >
                <small>{i ? 'H' + i : '¶'}</small>
                {i ? 'Заголовок ' + i : 'Обычный текст'}
              </button>
            ))}
          {popup.tool === 'insert' && (
            <>
              {(['table', 'formula', 'code'] as const).map((k) => (
                <button type="button" key={k} onClick={() => open(k, popup.anchor)}>
                  {names[k]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPopup(null);
                  file.current?.click();
                }}
              >
                Изображение
              </button>
            </>
          )}
          {popup.tool === 'table' && (
            <>
              {state && activeCell(state) && (
                <div className="ae-table-actions">
                  {(
                    [
                      ['addRow', 'Добавить строку'],
                      ['addColumn', 'Добавить столбец'],
                      ['deleteRow', 'Удалить строку'],
                      ['deleteColumn', 'Удалить столбец'],
                    ] as const
                  ).map(([action, label]) => (
                    <button
                      key={action}
                      type="button"
                      disabled={!editTable(action)(state)}
                      onClick={() => run(editTable(action))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <strong>Вставить таблицу</strong>
              <div className="ae-table-size">
                <label>
                  Столбцы
                  <select
                    aria-label="Столбцы"
                    value={size[1]}
                    onChange={(e) => setSize([size[0]!, Number(e.target.value)])}
                  >
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i}>{i + 1}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Строки
                  <select
                    aria-label="Строки"
                    value={size[0]}
                    onChange={(e) => setSize([Number(e.target.value), size[1]!])}
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <option key={i}>{i + 1}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => insert(newTable(size[0]!, size[1]!))}>
                  Вставить
                </button>
              </div>
              <div
                className="ae-grid"
                onKeyDown={(e) => {
                  const steps: Record<string, number> = {
                    ArrowUp: -8,
                    ArrowDown: 8,
                    ArrowLeft: -1,
                    ArrowRight: 1,
                  };
                  const step = steps[e.key];
                  if (!step || !(e.target instanceof HTMLButtonElement)) return;
                  e.preventDefault();
                  const cells = Array.from(e.currentTarget.querySelectorAll('button'));
                  cells[
                    Math.max(0, Math.min(cells.length - 1, cells.indexOf(e.target) + step))
                  ]?.focus();
                }}
              >
                {Array.from({ length: 48 }, (_, i) => {
                  const r = 1 + Math.floor(i / 8),
                    c = 1 + (i % 8);
                  return (
                    <button
                      type="button"
                      className={r <= size[0]! && c <= size[1]! ? 'is-filled' : ''}
                      key={i}
                      aria-label={`Таблица ${c} × ${r}`}
                      onFocus={() => setSize([r, c])}
                      onMouseEnter={() => setSize([r, c])}
                      onClick={() => insert(newTable(r, c))}
                    />
                  );
                })}
              </div>
              <span>
                {size[1]} × {size[0]}
              </span>
            </>
          )}
          {['link', 'formula', 'code'].includes(popup.tool) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!input.trim()) return;
                if (popup.tool === 'link') applyLink();
                else if (popup.tool === 'formula')
                  insert(
                    schema.nodes[display ? 'math_block' : 'math_inline']!.create({
                      tex: input.trim(),
                    }),
                  );
                else
                  insert(
                    schema.nodes.code_block!.create({ params: lang.trim() }, schema.text(input)),
                  );
              }}
            >
              <strong>{names[popup.tool]}</strong>
              {popup.tool === 'link' ? (
                <>
                  <label>
                    Адрес
                    <input
                      required
                      value={input}
                      placeholder="https://"
                      onChange={(e) => setInput(e.target.value)}
                    />
                  </label>
                  <label>
                    Текст ссылки
                    <input value={caption} onChange={(e) => setCaption(e.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {popup.tool === 'formula' ? 'Формула LaTeX' : 'Код'}
                    <textarea
                      required
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      rows={4}
                    />
                  </label>
                  {popup.tool === 'code' ? (
                    <label>
                      Язык
                      <input
                        value={lang}
                        placeholder="python"
                        onChange={(e) => setLang(e.target.value.replace(/[^а-яa-z0-9_+#.-]/gi, ''))}
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={display}
                          onChange={(e) => setDisplay(e.target.checked)}
                        />{' '}
                        Отдельной строкой
                      </label>
                      <div
                        className="ae-math"
                        dangerouslySetInnerHTML={{ __html: articleFormula(input, display) }}
                      />
                    </>
                  )}
                </>
              )}
              {popup.tool === 'link' &&
                state &&
                selection &&
                state.doc.rangeHasMark(selection.from, selection.to, schema.marks.link!) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (view) {
                        view.dispatch(
                          view.state.tr.removeMark(selection.from, selection.to, schema.marks.link),
                        );
                        finish();
                      }
                    }}
                  >
                    Убрать ссылку
                  </button>
                )}
              {error && <p role="alert">{error}</p>}
              <button type="submit" className="ae-submit" disabled={!input.trim()}>
                Применить
              </button>
            </form>
          )}
        </EditorPopover>
      )}
    </div>
  );
}
