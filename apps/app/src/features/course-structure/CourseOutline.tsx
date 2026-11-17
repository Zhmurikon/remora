import { Fragment, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { pluralWithCount } from '@remora/core';
import { Button } from '@remora/ui';
import { CourseAction, CourseIcon } from '../../components/CourseAction';
import type { OutlineSection, Position } from './order';
import { placeItem, samePosition } from './order';
import { OutlineMenu } from './OutlineMenu';
import { useOutlineDrag } from './useOutlineDrag';
import './outline.css';

function InlineTitle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const original = useRef(value);
  return (
    <textarea
      className="outline-title"
      aria-label={label}
      title="Изменить название"
      rows={1}
      maxLength={160}
      required
      value={value}
      onFocus={() => {
        original.current = value;
      }}
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onBlur={(e) => {
        if (!e.target.value.trim()) onChange(original.current);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          onChange(original.current);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const lessonCount = (n: number) => pluralWithCount(n, ['урок', 'урока', 'уроков']);

export function CourseOutline({
  sections,
  change,
  courseId,
  sets,
  dirty,
  saving,
  notice,
  saveTarget,
}: {
  sections: OutlineSection[];
  change: (next: OutlineSection[]) => void;
  courseId: string;
  sets: { id: string; title: string }[];
  dirty: boolean;
  saving: boolean;
  notice: string;
  saveTarget?: HTMLElement | null;
}) {
  const [expanded, setExpanded] = useState(() => new Set(sections.slice(0, 2).map((s) => s.key)));
  const expand = useCallback(
    (index: number) => {
      const key = sections[index]?.key;
      if (key) setExpanded((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
    },
    [sections],
  );
  const { root, drag, slot, handle } = useOutlineDrag(sections, change, expand);
  const count = sections.reduce((sum, s) => sum + s.articles.length, 0);
  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function update(i: number, section: OutlineSection) {
    change(sections.map((old, j) => (j === i ? section : old)));
  }
  function addSection() {
    const key = crypto.randomUUID();
    change([...sections, { key, title: 'Новый раздел', articles: [] }]);
    setExpanded((prev) => new Set([...prev, key]));
    focusTitle(key);
  }
  function focusTitle(key: string) {
    requestAnimationFrame(() => {
      const input = root.current?.querySelector<HTMLTextAreaElement>(
        `[data-item="${key}"] .outline-title`,
      );
      input?.focus();
      input?.select();
    });
  }
  function grip(position: Position, key: string, title: string) {
    return (
      <button type="button" className="outline-grip" {...handle(position, key, title)}>
        <CourseIcon name="grip" />
      </button>
    );
  }
  function marker(position: Position) {
    return slot && samePosition(slot, position) ? (
      <div className="outline-insert" aria-hidden="true" />
    ) : null;
  }
  function actions(from: Position) {
    const group = sections[from.section]!;
    const article = from.lesson === undefined ? undefined : group.articles[from.lesson];
    function focusMenu(key?: string) {
      requestAnimationFrame(() => {
        const button = key
          ? root.current?.querySelector<HTMLButtonElement>(`[data-item="${key}"] .outline-more`)
          : root.current?.querySelector<HTMLButtonElement>('.outline-tools button');
        button?.focus();
      });
    }
    return (
      <OutlineMenu
        sections={sections}
        position={from}
        onMove={(to) => {
          if (article) expand(to.section);
          change(placeItem(sections, from, to));
          focusMenu(article?.key ?? group.key);
        }}
        onRemove={() => {
          if (article && from.lesson !== undefined) {
            const rest = group.articles.filter((a) => a.key !== article.key);
            update(from.section, { ...group, articles: rest });
            focusMenu((rest[from.lesson] ?? rest[from.lesson - 1])?.key ?? group.key);
          } else {
            const rest = sections.filter((s) => s.key !== group.key);
            change(rest);
            focusMenu((rest[from.section] ?? rest[from.section - 1])?.key);
          }
        }}
      />
    );
  }
  const saveButton = (
    <Button
      type="submit"
      form="course-editor-form"
      className="min-h-11"
      disabled={saving || !dirty || !!drag}
      loading={saving}
    >
      <CourseIcon name="save" />
      Сохранить структуру
    </Button>
  );
  const target = drag?.to;
  return (
    <div className="course-outline" ref={root}>
      <div className="outline-heading">
        <div>
          <h2>Структура курса</h2>
          <small>
            {pluralWithCount(sections.length, ['раздел', 'раздела', 'разделов'])} ·{' '}
            {lessonCount(count)}
          </small>
        </div>
        <div className="outline-tools">
          <Button
            type="button"
            aria-label="Добавить раздел"
            variant="secondary"
            disabled={sections.length >= 50}
            onClick={addSection}
          >
            ＋ Раздел
          </Button>
          {saveTarget ? createPortal(saveButton, saveTarget) : saveButton}
        </div>
      </div>
      <p className="outline-status" role="status">
        {saving ? 'Сохраняем…' : dirty ? 'Есть несохранённые изменения' : notice}
      </p>
      <span className="sr-only" id="outline-drag-help">
        Пробел — выбрать строку, стрелки вверх и вниз — позиция, влево и вправо — раздел урока.
        Enter — положить, Escape — отменить.
      </span>
      {sections.length === 0 && <p className="text-fg-muted">Добавьте первый раздел курса.</p>}
      {sections.map((s, si) => (
        <Fragment key={s.key}>
          {marker({ section: si })}
          <section
            data-group={si}
            className={
              'outline-section' +
              (drag?.from.lesson !== undefined && target?.section === si
                ? ' outline-destination'
                : '')
            }
          >
            <div
              data-section-heading=""
              data-item={s.key}
              className={
                'outline-row outline-chapter' + (drag?.key === s.key ? ' outline-lifted' : '')
              }
            >
              {grip({ section: si }, s.key, s.title)}
              <button
                type="button"
                className="outline-toggle"
                aria-expanded={expanded.has(s.key)}
                aria-label={`${expanded.has(s.key) ? 'Свернуть' : 'Раскрыть'} раздел «${s.title}»`}
                onClick={() => toggle(s.key)}
              >
                <CourseIcon name="chevron" />
              </button>
              <span className="outline-num">{String(si + 1).padStart(2, '0')}</span>
              <InlineTitle
                label={`Название раздела ${si + 1}`}
                value={s.title}
                onChange={(title) => update(si, { ...s, title })}
              />
              <small>{lessonCount(s.articles.length)}</small>
              {actions({ section: si })}
            </div>
            {expanded.has(s.key) && (
              <div className="outline-branch">
                {s.articles.map((a, ai) => {
                  const from = { section: si, lesson: ai };
                  const updateArticle = (patch: Partial<typeof a>) =>
                    update(si, {
                      ...s,
                      articles: s.articles.map((v, i) => (i === ai ? { ...v, ...patch } : v)),
                    });
                  return (
                    <Fragment key={a.key}>
                      {marker(from)}
                      <div
                        data-lesson={ai}
                        data-item={a.key}
                        className={
                          'outline-row outline-lesson' +
                          (drag?.key === a.key ? ' outline-lifted' : '')
                        }
                      >
                        {grip(from, a.key, a.title)}
                        <span className="outline-doc">
                          <CourseIcon name="document" />
                        </span>
                        <InlineTitle
                          label={`Статья ${si + 1}.${ai + 1}`}
                          value={a.title}
                          onChange={(title) => updateArticle({ title })}
                        />
                        {a.id && (
                          <CourseAction
                            label="Редактировать материал"
                            icon="edit"
                            to={`/courses/${courseId}/materials/${a.id}/edit`}
                          />
                        )}
                        {actions(from)}
                      </div>
                      {!a.id && (
                        <label className="outline-set">
                          Набор для статьи {si + 1}.{ai + 1}
                          <select
                            value={a.set_id ?? ''}
                            onChange={(e) => updateArticle({ set_id: e.target.value || null })}
                          >
                            <option value="">Создать новый пустой набор</option>
                            {sets.map((set) => (
                              <option key={set.id} value={set.id}>
                                {set.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </Fragment>
                  );
                })}
                {marker({ section: si, lesson: s.articles.length })}
                <button
                  type="button"
                  aria-label="Добавить статью"
                  className="outline-add"
                  disabled={count >= 100}
                  onClick={() => {
                    const key = crypto.randomUUID();
                    update(si, {
                      ...s,
                      articles: [...s.articles, { key, title: 'Новый урок', body: '' }],
                    });
                    focusTitle(key);
                  }}
                >
                  ＋ Урок
                </button>
              </div>
            )}
          </section>
        </Fragment>
      ))}
      {marker({ section: sections.length })}
      {drag && drag.pointer === null && (
        <div className="outline-drag-help">
          {drag.from.lesson === undefined ? '↑ ↓ — позиция' : '↑ ↓ — позиция · ← → — раздел'} ·
          Enter — положить · Esc — отменить
        </div>
      )}
      {drag?.pointer != null && (
        <div
          className="outline-ghost"
          style={{
            left: Math.max(8, Math.min(drag.x + 12, window.innerWidth - 248)),
            top: Math.max(8, Math.min(drag.y + 14, window.innerHeight - 70)),
          }}
          aria-hidden="true"
        >
          <CourseIcon name="grip" />
          {drag.title}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {target &&
          `Раздел ${target.section + 1}${target.lesson === undefined ? '' : `, позиция ${target.lesson + 1}`}`}
      </span>
    </div>
  );
}
