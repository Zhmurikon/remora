import { ReaderHeading } from '@remora/ui/reader';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function ReadingBreadcrumb({
  href,
  back,
  label,
}: {
  href: string;
  back: string;
  label: string;
}) {
  return (
    <nav className="reader-crumbs" aria-label="Хлебные крошки">
      <Link href={href}>
        <span aria-hidden="true">‹</span>
        {back}
      </Link>
      <span aria-hidden="true">/</span>
      <span>{label}</span>
    </nav>
  );
}

export function PublicReadingCover({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="public-course-cover">
      <Image
        className="course-illustration"
        src="/lecture-demo/course-books.webp"
        width={90}
        height={100}
        unoptimized
        alt=""
      />
      <ReaderHeading title={title} />
      {children}
    </div>
  );
}
