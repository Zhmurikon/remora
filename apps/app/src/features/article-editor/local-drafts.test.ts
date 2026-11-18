// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  readLocalArticleDrafts,
  writeLocalArticleDraft,
  removeLocalArticleDraft,
  type LocalArticleDraft,
} from './local-drafts';

const draft: LocalArticleDraft = {
  version: 1,
  writer: 'tab-1',
  userId: 'user-1',
  courseId: 'course-1',
  articleId: 'article-1',
  title: 'Название',
  body: 'Несохранённый текст',
  base: { title: 'Название', body: 'Сервер' },
  updatedAt: 100,
  needsReview: false,
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('восстанавливает полный текст и название и разделяет аккаунты и курсы', () => {
  expect(writeLocalArticleDraft(draft)).toBe(true);
  expect(readLocalArticleDrafts('user-1', 'course-1')).toEqual([draft]);
  expect(readLocalArticleDrafts('user-2', 'course-1')).toEqual([]);
  expect(readLocalArticleDrafts('user-1', 'course-2')).toEqual([]);
});
it('сохраняет независимые версии двух вкладок', () => {
  writeLocalArticleDraft(draft);
  const other = { ...draft, writer: 'tab-2', body: 'Другая вкладка', updatedAt: 200 };
  writeLocalArticleDraft(other);
  expect(readLocalArticleDrafts('user-1', 'course-1')).toEqual([other, draft]);
  removeLocalArticleDraft(draft);
  expect(readLocalArticleDrafts('user-1', 'course-1')).toEqual([other]);
});
it('не удаляет новые правки по завершении старого запроса', () => {
  writeLocalArticleDraft(draft);
  const newer = { ...draft, body: 'Продолжение', updatedAt: 101 };
  writeLocalArticleDraft(newer);
  removeLocalArticleDraft(draft);
  expect(readLocalArticleDrafts('user-1', 'course-1')).toEqual([newer]);
});
it('пропускает повреждённые записи и сохраняет требование проверки конфликта', () => {
  localStorage.setItem('remora:article-draft:v1:user-1:course-1:broken', '{');
  const review = { ...draft, needsReview: true };
  writeLocalArticleDraft(review);
  expect(readLocalArticleDrafts('user-1', 'course-1')).toEqual([review]);
});
it('возвращает ошибку, если хранилище заполнено или заблокировано', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  expect(writeLocalArticleDraft(draft)).toBe(false);
});
