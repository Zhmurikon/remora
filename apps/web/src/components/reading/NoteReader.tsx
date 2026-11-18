'use client';

import { ReaderHeading, ReaderLayout, ReaderToolbar } from '@remora/ui/reader';
import { useState, type ReactNode } from 'react';
import { ReadingBreadcrumb } from './PublicReadingCover';

export function NoteReader({ title, children }: { title: string; children: ReactNode }) {
  const [largeText, setLargeText] = useState(false);
  return (
    <ReaderLayout
      className="public-reader course-width"
      top={<ReadingBreadcrumb href="/" back="Главная" label="Конспект лекции" />}
    >
      <article className="reader-article" aria-label={title}>
        <ReaderHeading title={title} />
        <ReaderToolbar
          label="Навигация по конспекту"
          tabs={
            <a href="#note-content" aria-current="location">
              Читать конспект
            </a>
          }
          largeText={largeText}
          toggleText={() => setLargeText(!largeText)}
        />
        <div id="note-content" tabIndex={-1} className="course-reading" data-large={largeText}>
          {children}
        </div>
      </article>
    </ReaderLayout>
  );
}
