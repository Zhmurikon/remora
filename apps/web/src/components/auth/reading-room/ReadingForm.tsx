'use client';

import { Button } from '@remora/ui';
import Link from 'next/link';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';

export function ReadingHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="reading-title">
        <span>{title}</span>
      </h1>
      <p className="reading-intro">
        {description.split(' ').map((word, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className="reading-word" style={{ animationDelay: `${i * 45}ms` }}>
              {word}
            </span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}

function PenStroke() {
  return (
    <svg
      className="reading-submit-ink"
      viewBox="0 0 220 48"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        pathLength="1"
        d="M-10 7L230 -3L-10 20L230 9L-10 32L230 21L-10 44L230 33L-10 57L230 45"
      />
    </svg>
  );
}

export function ReadingSubmit({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" loading={loading} fullWidth className="reading-submit">
      <PenStroke />
      {children}
    </Button>
  );
}

export function ReadingResult({
  title,
  children,
  href = '/login',
  action,
}: {
  title: string;
  children: ReactNode;
  href?: string;
  action: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <div className="reading-confirmation">
      <h1 className="reading-title" ref={heading} tabIndex={-1}>
        <span>{title}</span>
      </h1>
      <p className="reading-intro">{children}</p>
      <Link href={href} className="reading-submit">
        <PenStroke />
        {action}
      </Link>
    </div>
  );
}
