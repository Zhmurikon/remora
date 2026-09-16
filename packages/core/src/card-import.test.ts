import { describe, expect, it } from 'vitest';
import { parseCardImport } from './card-import';

describe('parseCardImport', () => {
  it('разбирает экспорт Quizlet с табуляцией', () => {
    expect(parseCardImport('memory\tпамять\r\nlearn\tучиться')).toMatchObject({
      cards: [
        { term: 'memory', definition: 'память' },
        { term: 'learn', definition: 'учиться' },
      ],
      skipped: 0,
      detected: { cardSeparator: 'newline', sideSeparator: 'tab' },
    });
  });

  it('автоматически определяет CSV', () => {
    expect(parseCardImport('one,один\ntwo,два')).toMatchObject({
      cards: [
        { term: 'one', definition: 'один' },
        { term: 'two', definition: 'два' },
      ],
      detected: { cardSeparator: 'newline', sideSeparator: 'comma' },
    });
  });

  it('поддерживает кавычки, экранированные кавычки и многострочные значения', () => {
    expect(
      parseCardImport('"hello, world","строка 1\nстрока 2"\n"say ""hi""",ответ'),
    ).toMatchObject({
      cards: [
        { term: 'hello, world', definition: 'строка 1\nстрока 2' },
        { term: 'say "hi"', definition: 'ответ' },
      ],
      skipped: 0,
    });
  });

  it('удаляет BOM из CSV, сохранённого Excel', () => {
    expect(parseCardImport('\uFEFFтермин,определение')).toMatchObject({
      cards: [{ term: 'термин', definition: 'определение' }],
    });
  });

  it('возвращает номера и причины пропущенных строк', () => {
    expect(parseCardImport('готово\tда\nбез разделителя\n\tпусто')).toMatchObject({
      skipped: 2,
      issues: [
        { row: 2, message: 'Не найден разделитель сторон' },
        { row: 3, message: 'Термин или определение пусты' },
      ],
    });
  });

  it('сообщает о незакрытой кавычке', () => {
    expect(parseCardImport('слово\t"не закрыто')).toMatchObject({
      cards: [],
      issues: [{ row: 1, message: 'Не закрыта кавычка' }],
    });
  });

  it('сопоставляет выбранные колонки и пропускает заголовок', () => {
    expect(
      parseCardImport('Подсказка,Определение,Термин\nfruit,яблоко,apple\nverb,бежать,run', {
        cardSeparator: 'auto',
        sideSeparator: 'auto',
        termColumn: 2,
        definitionColumn: 1,
        skipFirstRow: true,
      }),
    ).toMatchObject({
      columns: ['Подсказка', 'Определение', 'Термин'],
      cards: [
        { term: 'apple', definition: 'яблоко' },
        { term: 'run', definition: 'бежать' },
      ],
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
