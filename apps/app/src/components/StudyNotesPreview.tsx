import { ArticleContent } from '@remora/ui';

// Разрешены только details/summary без атрибутов. Остальной HTML остаётся обычным текстом.
export function StudyNotesPreview({ value }: { value: string }) {
  const parts = value.split(/(<details>\s*<summary>[^<>]*<\/summary>[\s\S]*?<\/details>)/g);
  const markdown = (text: string) =>
    text.replace(
      /^>[ \t]*\[!(abstract|important|warning|info|tip)\][ \t]*(.*)$/gm,
      (_, kind: string, title: string) =>
        `> **${title || { abstract: 'Коротко', important: 'Важно', warning: 'Обратите внимание', info: 'Уточнение', tip: 'Подсказка' }[kind]}**`,
    );
  return (
    <div className="min-w-0 space-y-5">
      {parts.map((part, index) => {
        const detail = part.match(
          /^<details>\s*<summary>([^<>]*)<\/summary>([\s\S]*?)<\/details>$/,
        );
        return detail ? (
          <details key={index} className="border-border rounded-lg border px-4">
            <summary className="focus-visible:ring-primary min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-none focus-visible:ring-2">
              {detail[1]}
            </summary>
            <div className="pb-4">
              <ArticleContent value={markdown(detail[2] ?? '')} headingLevel={2} />
            </div>
          </details>
        ) : (
          <ArticleContent key={index} value={markdown(part)} headingLevel={2} />
        );
      })}
    </div>
  );
}
