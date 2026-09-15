import katex from 'katex';
import { useMemo } from 'react';
import 'katex/dist/katex.min.css';

export default function FormulaContent({ value, className }: { value: string; className: string }) {
  const markup = useMemo(
    () =>
      katex.renderToString(value, {
        displayMode: true,
        output: 'htmlAndMathml',
        strict: 'ignore',
        throwOnError: false,
        trust: false,
      }),
    [value],
  );
  return (
    <div
      className={`rm-formula max-w-full overflow-x-auto py-2 ${className}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
