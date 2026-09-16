export type CardSeparator = 'auto' | 'newline' | 'semicolon' | 'custom';
export type SideSeparator = 'auto' | 'tab' | 'comma' | 'semicolon' | 'custom';

export interface CardImportOptions {
  cardSeparator: CardSeparator;
  sideSeparator: SideSeparator;
  customCardSeparator?: string;
  customSideSeparator?: string;
  termColumn?: number;
  definitionColumn?: number;
  skipFirstRow?: boolean;
}

export interface ImportedCard {
  term: string;
  definition: string;
}

export interface CardImportIssue {
  row: number;
  message: string;
}

export interface CardImportResult {
  cards: ImportedCard[];
  skipped: number;
  issues: CardImportIssue[];
  columns: string[];
  detected: {
    cardSeparator: Exclude<CardSeparator, 'auto' | 'custom'> | 'custom';
    sideSeparator: Exclude<SideSeparator, 'auto' | 'custom'> | 'custom';
  };
}

export const defaultCardImportOptions: CardImportOptions = {
  cardSeparator: 'auto',
  sideSeparator: 'auto',
};

interface ParsedRow {
  fields: string[];
  row: number;
  malformed: boolean;
}

export function parseCardImport(
  source: string,
  options: CardImportOptions = defaultCardImportOptions,
): CardImportResult {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const detected = detectSeparators(normalized, options);
  const cardSeparator = resolveCardSeparator(options, detected.cardSeparator);
  const sideSeparator = resolveSideSeparator(options, detected.sideSeparator);

  if (!cardSeparator || !sideSeparator) {
    const hasContent = normalized.trim().length > 0;
    return {
      cards: [],
      skipped: hasContent ? 1 : 0,
      issues: hasContent ? [{ row: 1, message: 'Укажите непустые разделители' }] : [],
      columns: [],
      detected,
    };
  }

  const rows = parseRows(normalized, cardSeparator, sideSeparator);
  const firstContentRow = rows.find((row) => row.fields.some((field) => field.trim() !== ''));
  const columns = firstContentRow?.fields.map((field) => field.trim()) ?? [];
  const cards: ImportedCard[] = [];
  const issues: CardImportIssue[] = [];

  for (const row of rows) {
    if (row.fields.every((field) => field.trim() === '')) continue;
    if (options.skipFirstRow && row === firstContentRow) continue;
    if (row.malformed) {
      issues.push({ row: row.row, message: 'Не закрыта кавычка' });
      continue;
    }
    if (row.fields.length < 2) {
      issues.push({ row: row.row, message: 'Не найден разделитель сторон' });
      continue;
    }

    const termColumn = options.termColumn ?? 0;
    const definitionColumn = options.definitionColumn ?? 1;
    const term = row.fields[termColumn]?.trim() ?? '';
    // При обычной вставке остаток строки не теряем; при явном маппинге берём выбранную колонку.
    const definition =
      options.definitionColumn === undefined
        ? row.fields.slice(1).join(sideSeparator).trim()
        : (row.fields[definitionColumn]?.trim() ?? '');
    if (!term || !definition) {
      issues.push({ row: row.row, message: 'Термин или определение пусты' });
      continue;
    }
    cards.push({ term, definition });
  }

  return { cards, skipped: issues.length, issues, columns, detected };
}

function detectSeparators(
  source: string,
  options: CardImportOptions,
): CardImportResult['detected'] {
  const cardSeparator =
    options.cardSeparator === 'auto'
      ? detectCardSeparator(source)
      : options.cardSeparator === 'custom'
        ? 'custom'
        : options.cardSeparator;
  const resolvedCardSeparator =
    cardSeparator === 'custom'
      ? options.customCardSeparator || '\n'
      : separatorValue(cardSeparator);
  const sideSeparator =
    options.sideSeparator === 'auto'
      ? detectSideSeparator(source, resolvedCardSeparator)
      : options.sideSeparator === 'custom'
        ? 'custom'
        : options.sideSeparator;
  return { cardSeparator, sideSeparator };
}

function detectCardSeparator(source: string): CardImportResult['detected']['cardSeparator'] {
  if (hasOutsideQuotes(source, '\n')) return 'newline';
  if (hasOutsideQuotes(source, ';')) return 'semicolon';
  return 'newline';
}

function detectSideSeparator(
  source: string,
  cardSeparator: string,
): CardImportResult['detected']['sideSeparator'] {
  const firstRecord = firstOutsideQuotes(source, cardSeparator);
  const candidates = [
    { kind: 'tab' as const, value: '\t' },
    { kind: 'comma' as const, value: ',' },
    { kind: 'semicolon' as const, value: ';' },
  ];
  return candidates.find(({ value }) => hasOutsideQuotes(firstRecord, value))?.kind ?? 'tab';
}

function parseRows(source: string, cardSeparator: string, sideSeparator: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let fields: string[] = [];
  let field = '';
  let row = 1;
  let rowStart = 1;
  let quoted = false;
  let malformed = false;

  for (let index = 0; index < source.length;) {
    const char = source[index] ?? '';
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (quoted || field.trim() === '') {
        quoted = !quoted;
        index += 1;
        continue;
      }
    }
    if (!quoted && source.startsWith(sideSeparator, index)) {
      fields.push(field);
      field = '';
      index += sideSeparator.length;
      continue;
    }
    if (!quoted && source.startsWith(cardSeparator, index)) {
      fields.push(field);
      rows.push({ fields, row: rowStart, malformed });
      fields = [];
      field = '';
      index += cardSeparator.length;
      row += countNewlines(cardSeparator);
      rowStart = row;
      malformed = false;
      continue;
    }
    field += char;
    if (char === '\n') row += 1;
    index += 1;
  }

  if (quoted) malformed = true;
  fields.push(field);
  rows.push({ fields, row: rowStart, malformed });
  return rows;
}

function hasOutsideQuotes(source: string, separator: string): boolean {
  return firstOutsideQuotes(source, separator) !== source;
}

function firstOutsideQuotes(source: string, separator: string): string {
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"') {
      if (quoted && source[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && source.startsWith(separator, index)) {
      return source.slice(0, index);
    }
  }
  return source;
}

function resolveCardSeparator(
  options: CardImportOptions,
  detected: CardImportResult['detected']['cardSeparator'],
): string {
  if (options.cardSeparator === 'custom') return options.customCardSeparator ?? '';
  return separatorValue(options.cardSeparator === 'auto' ? detected : options.cardSeparator);
}

function resolveSideSeparator(
  options: CardImportOptions,
  detected: CardImportResult['detected']['sideSeparator'],
): string {
  if (options.sideSeparator === 'custom') return options.customSideSeparator ?? '';
  return separatorValue(options.sideSeparator === 'auto' ? detected : options.sideSeparator);
}

function separatorValue(kind: string): string {
  if (kind === 'newline') return '\n';
  if (kind === 'semicolon') return ';';
  if (kind === 'comma') return ',';
  if (kind === 'tab') return '\t';
  return '';
}

function countNewlines(value: string): number {
  return Math.max(1, value.split('\n').length - 1);
}
