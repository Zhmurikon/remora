import { lazy, Suspense } from 'react';
import './card-content.css';

export type CardContentType = 'text' | 'latex' | 'code';

export interface CardContentProps {
  value: string;
  type?: CardContentType;
  codeLanguage?: string | null;
  className?: string;
}

const HighlightedCode = lazy(() => import('./HighlightedCode'));
const FormulaContent = lazy(() => import('./FormulaContent'));

export const codeLanguageOptions = [
  ['text', 'Без подсветки'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['csharp', 'C#'],
  ['cpp', 'C++'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['kotlin', 'Kotlin'],
  ['swift', 'Swift'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['sql', 'SQL'],
  ['bash', 'Bash'],
  ['json', 'JSON'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['yaml', 'YAML'],
] as const;

export function CardContent({
  value,
  type = 'text',
  codeLanguage,
  className = '',
}: CardContentProps) {
  if (!value) return <span className={className}>—</span>;
  if (type === 'latex') {
    return (
      <Suspense fallback={<p className={className}>{value}</p>}>
        <FormulaContent value={value} className={className} />
      </Suspense>
    );
  }
  if (type === 'code') {
    return (
      <Suspense fallback={<CodeFallback value={value} className={className} />}>
        <HighlightedCode value={value} language={codeLanguage} className={className} />
      </Suspense>
    );
  }
  return <p className={`whitespace-pre-wrap break-words ${className}`}>{value}</p>;
}

function CodeFallback({ value, className }: { value: string; className: string }) {
  return (
    <pre className={`bg-surface-muted max-w-full overflow-x-auto rounded-xl p-4 ${className}`}>
      <code>{value}</code>
    </pre>
  );
}
