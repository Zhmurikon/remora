// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { articleMediaIds } from './article-markdown';

// Общий контракт с сервером: тот же файл проверяет apps/api/tests/test_article_media.py.
const casesUrl = new URL('../../../core/src/article-media-cases.json', import.meta.url);
const { cases } = JSON.parse(readFileSync(fileURLToPath(casesUrl), 'utf8')) as {
  cases: { name: string; body: string; ids: string[] }[];
};

describe('articleMediaIds (контракт с сервером)', () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(articleMediaIds(testCase.body)).toEqual(testCase.ids);
    });
  }
});
