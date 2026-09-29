import { describe, expect, it } from 'vitest';
import { hasNoVisibleSets } from './SetsPage';

describe('пустое состояние списка наборов', () => {
  it('не показывается в папке, где есть только сохранённый набор', () => {
    expect(hasNoVisibleSets('all', 'course-folder', 0, 1)).toBe(false);
  });

  it('учитывает активный фильтр и архив', () => {
    expect(hasNoVisibleSets('owned', 'course-folder', 0, 1)).toBe(true);
    expect(hasNoVisibleSets('saved', 'course-folder', 1, 0)).toBe(true);
    expect(hasNoVisibleSets('all', 'archived', 0, 3)).toBe(true);
  });
});
