import { ArticleContent, type ArticleMedia, Button } from '@remora/ui';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CourseAttachments } from '../../components/CourseAttachments';
import { CourseIcon } from '../../components/CourseAction';
import type { OutlineArticle, OutlineSection } from '../course-structure/order';
import { EditorPopover } from './EditorPopover';
import { RichArticleEditor } from './RichArticleEditor';
import './article-editor.css';
import '../../pages/materials.css';
import '@remora/ui/styles/course-typography.css';

type Props = {
  courseId: string;
  sections: OutlineSection[];
  article: OutlineArticle;
  section: OutlineSection;
  dirty: boolean;
  saving: boolean;
  restoring: boolean;
  saveFailed: boolean;
  autoSaveBlocked: boolean;
  notice: string;
  error: ReactNode;
  media: Record<string, ArticleMedia>;
  addMedia: (id: string, m: ArticleMedia) => void;
  update: (patch: Partial<OutlineArticle>) => void;
  save: () => void;
};
export function ArticleWorkspace({
  courseId,
  sections,
  article,
  section,
  dirty,
  saving,
  restoring,
  saveFailed,
  autoSaveBlocked,
  notice,
  error,
  media,
  addMedia,
  update,
  save,
}: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'edit' | 'preview' | 'source'>('edit');
  const [files, setFiles] = useState(false),
    [more, setMore] = useState<HTMLElement | null>(null),
    [uploading, setUploading] = useState(false);
  const title = useRef<HTMLTextAreaElement>(null);
  const header = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = header.current!;
    const measure = () =>
      el.parentElement?.style.setProperty('--ae-head-height', el.offsetHeight + 'px');
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const body = article.body ?? '';
  const heading = body.match(/^(# +)([^\r\n]*)(\r?\n(?:[ \t]*\r?\n)*|$)/);
  const normalize = (v: string) => v.trim().replace(/^(\d+(?:\.\d+)*)\.?(?=\s)/, '$1');
  const prefix = heading && normalize(heading[2]!) === normalize(article.title) ? heading[0] : '';
  const busy = uploading || restoring,
    valid = !!article.title.trim() && body.length <= 100000;
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !busy && !saving && valid) save();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [save, dirty, busy, saving, valid]);
  const latestSave = useRef(save);
  latestSave.current = save;
  useEffect(() => {
    if (!dirty || saving || busy || !valid || autoSaveBlocked) return;
    const timer = window.setTimeout(() => latestSave.current(), saveFailed ? 5000 : 1200);
    const reconnect = () => latestSave.current();
    window.addEventListener('online', reconnect);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', reconnect);
    };
  }, [body, article.title, dirty, saving, busy, valid, autoSaveBlocked, saveFailed]);
  const saveOnLeave = useRef(false);
  saveOnLeave.current = dirty && !saving && !busy && valid && !autoSaveBlocked;
  useEffect(
    () => () => {
      if (saveOnLeave.current) latestSave.current();
    },
    [],
  );
  const read = '/courses/' + courseId + '/read?article=' + article.id;
  return (
    <div className="ae-page materials-page">
      <nav className="ae-crumb" aria-label="Навигация по курсу">
        <Link to={`/courses/${courseId}/structure`}>← Структура курса</Link>
        <span aria-hidden="true">/</span>
        <span>{section.title}</span>
      </nav>
      <div className="ae-head" ref={header}>
        <h1>
          <textarea
            ref={title}
            aria-label="Название статьи"
            maxLength={160}
            rows={1}
            disabled={busy}
            value={article.title}
            onChange={(e) => {
              const next = e.target.value.replace(/[\r\n]+/g, ' ');
              update(
                prefix && heading
                  ? {
                      title: next,
                      body: heading[1] + next + heading[3] + body.slice(prefix.length),
                    }
                  : { title: next },
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                title.current?.blur();
              }
            }}
          />
        </h1>
        <div className="ae-commands">
          <label className="ae-switch">
            Сменить урок ⌄
            <select
              aria-label="Материал курса"
              disabled={busy}
              value={article.id ?? ''}
              onChange={(e) => {
                if (
                  !dirty ||
                  window.confirm('Изменения не сохранены. Перейти к другому материалу?')
                )
                  navigate(`/courses/${courseId}/materials/${e.target.value}/edit`);
              }}
            >
              {sections.map((s) => (
                <optgroup key={s.key} label={s.title}>
                  {s.articles
                    .filter((a) => a.id)
                    .map((a) => (
                      <option key={a.key} value={a.id!}>
                        {a.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ae-icon"
            aria-label="Другие действия"
            aria-expanded={!!more}
            onClick={(e) => setMore(more ? null : e.currentTarget)}
          >
            <CourseIcon name="more" />
          </button>
          <Button
            type="button"
            aria-label="Сохранить материал"
            loading={saving}
            disabled={!valid || busy || saving || !dirty}
            onClick={save}
          >
            <CourseIcon name="save" />
            Сохранить
          </Button>
        </div>
      </div>
      {more && (
        <EditorPopover anchor={more} label="Другие действия" close={() => setMore(null)}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'source' ? 'edit' : 'source');
              setMore(null);
            }}
          >
            <CourseIcon name="code" />
            {mode === 'source' ? 'Визуальный редактор' : 'Исходный Markdown'}
          </button>
          <Link to={read}>
            <CourseIcon name="eye" />
            Открыть урок
          </Link>
          <Link to={`/courses/${courseId}/edit`}>
            <CourseIcon name="section" />
            Настройки курса
          </Link>
        </EditorPopover>
      )}
      <div role="status" className="ae-status">
        {restoring
          ? 'Восстанавливаем черновик…'
          : uploading
            ? 'Загружаем изображение…'
            : saving
              ? 'Сохраняем…'
              : saveFailed
                ? autoSaveBlocked
                  ? 'Автосохранение остановлено'
                  : 'Не удалось сохранить. Повторим автоматически…'
                : dirty
                  ? autoSaveBlocked
                    ? 'Проверьте восстановленный текст и сохраните его'
                    : 'Ожидаем автосохранения…'
                  : notice || 'Все изменения сохранены'}
      </div>
      {!valid && (
        <p role="alert">
          {!article.title.trim()
            ? 'Введите название статьи.'
            : 'Максимальная длина статьи — 100 000 символов.'}
        </p>
      )}
      {error}
      <div className="ae-modes">
        <div className="ae-tabs">
          <button
            type="button"
            aria-pressed={mode !== 'preview'}
            disabled={busy}
            onClick={() => setMode('edit')}
          >
            <CourseIcon name="edit" />
            {mode === 'source' ? 'Markdown' : 'Текст'}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            aria-label="Предпросмотр теории"
            disabled={busy}
            onClick={() => setMode('preview')}
          >
            <CourseIcon name="eye" />
            Предпросмотр
          </button>
        </div>
        <div className="ae-links">
          <button type="button" aria-expanded={files} onClick={() => setFiles(!files)}>
            <CourseIcon name="clip" />
            Вложения
          </button>
          <Link to={`/sets/${article.set_id}/edit`} target="_blank" rel="noopener noreferrer">
            <CourseIcon name="cards" />
            Карточки для запоминания
          </Link>
        </div>
      </div>
      {files && (
        <CourseAttachments
          courseId={courseId}
          articleId={article.id ?? undefined}
          canEdit
          compact
        />
      )}
      {mode !== 'source' && (
        <div hidden={mode !== 'edit'}>
          <RichArticleEditor
            value={body.slice(prefix.length)}
            media={media}
            onImage={addMedia}
            onChange={(s) =>
              update({ body: prefix + (prefix && !prefix.endsWith('\n') && s ? '\n\n' : '') + s })
            }
            onUploading={setUploading}
            busy={busy}
          />
        </div>
      )}
      {mode === 'source' && (
        <textarea
          className="ae-source"
          aria-label="Исходный Markdown"
          value={body}
          disabled={busy}
          maxLength={100000}
          onChange={(e) => update({ body: e.target.value })}
        />
      )}
      {mode === 'preview' && (
        <div className="ae-paper course-reading">
          <ArticleContent
            value={body}
            headingLevel={2}
            articleTitle={article.title}
            media={media}
            className="ae-preview"
          />
        </div>
      )}
    </div>
  );
}
