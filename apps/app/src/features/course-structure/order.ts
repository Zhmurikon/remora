import type { components } from '@remora/api-client';

export type OutlineArticle = components['schemas']['ArticleWrite'] & { key: string };
export type OutlineSection = Omit<components['schemas']['SectionWrite'], 'articles'> & {
  key: string;
  articles: OutlineArticle[];
};
export type Position = { section: number; lesson?: number };

export function samePosition(a: Position, b: Position) {
  return a.section === b.section && a.lesson === b.lesson;
}

// Целевая позиция относится к списку после извлечения строки.
export function placeItem(
  sections: OutlineSection[],
  from: Position,
  to: Position,
): OutlineSection[] {
  if (samePosition(from, to)) return sections;
  const next = [...sections];
  if (from.lesson === undefined) {
    const [item] = next.splice(from.section, 1);
    next.splice(to.section, 0, item!);
  } else {
    const source = next[from.section]!;
    const articles = [...source.articles];
    const [item] = articles.splice(from.lesson, 1);
    next[from.section] = { ...source, articles };
    const dest = next[to.section]!;
    const inserted = [...dest.articles];
    inserted.splice(to.lesson!, 0, item!);
    next[to.section] = { ...dest, articles: inserted };
  }
  return next;
}
