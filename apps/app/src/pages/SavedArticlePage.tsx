import { ArticleContent } from '@remora/ui';
import { ReaderHeading, ReaderLayout, ReaderToolbar } from '@remora/ui/reader';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../lib/api';

export function SavedArticlePage() {
  const { saveId = '' } = useParams();
  const [largeText, setLargeText] = useState(false);
  const article = useQuery({
    queryKey: ['library', saveId, 'article'],
    queryFn: async () => {
      const { data } = await api.GET('/api/v1/library/{save_id}/article', {
        params: { path: { save_id: saveId } },
      });
      if (!data) throw new Error('Не удалось открыть сохранённую статью.');
      return data;
    },
  });

  return (
    <ReaderLayout
      className="materials-page"
      top={
        <div className="reader-crumbs">
          <Link to="/library/manage">
            <span aria-hidden="true">‹</span> Сохранённые материалы
          </Link>
        </div>
      }
    >
      <article className="reader-article">
        {article.isPending && <p role="status">Загружаем статью…</p>}
        {article.isError && (
          <p role="alert">
            {article.error.message}{' '}
            <button className="manage-link" onClick={() => void article.refetch()}>
              Повторить
            </button>
          </p>
        )}
        {article.data && (
          <>
            <ReaderHeading title={article.data.title} />
            <ReaderToolbar
              label="Настройки чтения"
              largeText={largeText}
              toggleText={() => setLargeText(!largeText)}
            />
            <div className="course-reading" data-large={largeText}>
              {article.data.body ? (
                <ArticleContent
                  value={article.data.body}
                  articleTitle={article.data.title}
                  headingLevel={2}
                  media={Object.fromEntries(article.data.media.map((item) => [item.id, item]))}
                />
              ) : (
                <p>В этой статье пока нет текста.</p>
              )}
            </div>
          </>
        )}
      </article>
    </ReaderLayout>
  );
}
