'use client';

import katex from 'katex';
import { useMemo } from 'react';
import 'katex/dist/katex.min.css';

export default function FormulaContent({
  value,
  className = '',
  display = true,
}: {
  value: string;
  className?: string;
  display?: boolean;
}) {
  const markup = useMemo(
    () =>
      katex.renderToString(value, {
        displayMode: display,
        output: 'htmlAndMathml',
        strict: 'ignore',
        throwOnError: false,
        trust: false,
      }),
    [value, display],
  );
  // Строчная формула не должна ломать поток текста, поэтому это span без прокрутки и отступов.
  if (!display)
    return <span className={`rm-formula-inline ${className}`} dangerouslySetInnerHTML={{ __html: markup }} />;
  return (
    <div
      className={`rm-formula max-w-full overflow-x-auto py-2 ${className}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
