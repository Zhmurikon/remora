import { describe, expect, it } from 'vitest';
import { parseCardImport } from './card-import';

describe('parseCardImport', () => {
  it('разбирает экспорт Quizlet с табуляцией', () => {
    expect(parseCardImport('memory\tпамять\r\nlearn\tучиться')).toEqual({
      cards: [
        { term: 'memory', definition: 'память' },
        { term: 'learn', definition: 'учиться' },
      ],
      skipped: 0,
    });
  });

  it('поддерживает запятую и точки с запятой', () => {
    expect(
      parseCardImport('one,один;two,два', {
        cardSeparator: 'semicolon',
        sideSeparator: 'comma',
      }),
    ).toMatchObject({
      cards: [
        { term: 'one', definition: 'один' },
        { term: 'two', definition: 'два' },
      ],
    });
  });

  it('пропускает строки без обеих сторон и считает их', () => {
    expect(parseCardImport('готово\tда\nнет разделителя\n\tпусто')).toMatchObject({
      cards: [{ term: 'готово', definition: 'да' }],
      skipped: 2,
    });
  });
});
