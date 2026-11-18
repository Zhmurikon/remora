export type ArticleText = { title: string; body: string };
export type LocalArticleDraft = ArticleText & {
  version: 1;
  writer: string;
  userId: string;
  courseId: string;
  articleId: string;
  base: ArticleText;
  updatedAt: number;
  needsReview: boolean;
};

function prefix(userId: string, courseId: string) {
  return (
    'remora:article-draft:v1:' +
    encodeURIComponent(userId) +
    ':' +
    encodeURIComponent(courseId) +
    ':'
  );
}
function key(draft: LocalArticleDraft) {
  return (
    prefix(draft.userId, draft.courseId) + encodeURIComponent(draft.articleId) + ':' + draft.writer
  );
}
function isText(value: unknown): value is ArticleText {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ArticleText).title === 'string' &&
    typeof (value as ArticleText).body === 'string'
  );
}
export function sameArticle(a: ArticleText, b: ArticleText) {
  return a.title.trim() === b.title.trim() && a.body === b.body;
}
export function readLocalArticleDrafts(userId: string, courseId: string): LocalArticleDraft[] {
  try {
    const found: LocalArticleDraft[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(prefix(userId, courseId))) continue;
      try {
        const draft = JSON.parse(
          localStorage.getItem(storageKey) ?? 'null',
        ) as LocalArticleDraft | null;
        if (
          isText(draft) &&
          draft.version === 1 &&
          draft.userId === userId &&
          draft.courseId === courseId &&
          typeof draft.articleId === 'string' &&
          typeof draft.writer === 'string' &&
          isText(draft.base) &&
          typeof draft.needsReview === 'boolean' &&
          Number.isFinite(draft.updatedAt) &&
          draft.updatedAt > 0 &&
          key(draft) === storageKey
        )
          found.push(draft);
      } catch {
        // Повреждённая запись не должна скрывать остальные черновики.
      }
    }
    return found.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
export function writeLocalArticleDraft(draft: LocalArticleDraft): boolean {
  try {
    localStorage.setItem(key(draft), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
export function removeLocalArticleDraft(draft: LocalArticleDraft): boolean {
  try {
    // Ответ старого запроса не должен удалить правки, появившиеся после его отправки.
    const current = localStorage.getItem(key(draft));
    if (current === JSON.stringify(draft)) localStorage.removeItem(key(draft));
    return true;
  } catch {
    return false;
  }
}
