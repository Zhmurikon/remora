'use client';

import { articleFormula } from './article-formula';
import { useMemo } from 'react';

export default function FormulaContent({
  value,
  className = '',
  display = true,
}: {
  value: string;
  className?: string;
  display?: boolean;
}) {
  const markup = useMemo(() => articleFormula(value, display), [value, display]);
  // Строчная формула не должна ломать поток текста, поэтому это span без прокрутки и отступов.
  if (!display)
    return (
      <span
        className={`rm-formula-inline ${className}`}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  return (
    <div
      className={`rm-formula max-w-full overflow-x-auto py-2 ${className}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
