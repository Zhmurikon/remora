// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { clearLectureIntent, pendingLectureId } from './lecture-demo-draft';

const id = '447c8648-424d-4551-9b27-095700b26015';
const key = 'lecture-demo:continue:learner@example.com';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it('продолжает регистрацию в другой вкладке только для выбранного аккаунта', () => {
  localStorage.setItem(key, JSON.stringify({ id, expires: Date.now() + 60000 }));
  expect(pendingLectureId('other@example.com')).toBeNull();
  expect(pendingLectureId('Learner@example.com')).toBe(id);
  clearLectureIntent(id, 'other@example.com');
  expect(pendingLectureId('learner@example.com')).toBe(id);
  clearLectureIntent(id, 'learner@example.com');
  expect(pendingLectureId('learner@example.com')).toBeNull();
});

it('не переводит пользователя в кабинет с просроченным черновиком', () => {
  localStorage.setItem(key, JSON.stringify({ id, expires: Date.now() - 1 }));
  expect(pendingLectureId('learner@example.com')).toBeNull();
});
