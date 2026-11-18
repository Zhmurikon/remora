import type { ReactNode, Ref } from 'react';
import '../styles/reader.css';

export { ReaderOutline } from './ReaderOutline';
export { ReaderToolbar } from './ReaderToolbar';

export function ReaderLayout({
  className = '',
  top,
  outline,
  children,
}: {
  className?: string;
  top: ReactNode;
  outline?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`reader-page ${className}`.trim()}>
      <header className="reader-top">{top}</header>
      <div className="reader-spread">
        {outline}
        {children}
      </div>
    </div>
  );
}

export function ReaderHeading({
  level = 1,
  headingRef,
  meta,
  title,
  children,
}: {
  level?: 1 | 2;
  headingRef?: Ref<HTMLHeadingElement>;
  meta?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  const Heading = level === 2 ? 'h2' : 'h1';
  return (
    <header>
      {meta && <p className="reader-meta">{meta}</p>}
      <Heading className="reader-title" ref={headingRef} tabIndex={-1}>
        {title}
      </Heading>
      {children}
    </header>
  );
}
