export type CardSeparator = 'newline' | 'semicolon' | 'custom';
export type SideSeparator = 'tab' | 'comma' | 'custom';

export interface CardImportOptions {
  cardSeparator: CardSeparator;
  sideSeparator: SideSeparator;
  customCardSeparator?: string;
  customSideSeparator?: string;
}

export interface ImportedCard {
  term: string;
  definition: string;
}

export interface CardImportResult {
  cards: ImportedCard[];
  skipped: number;
}

export const defaultCardImportOptions: CardImportOptions = {
  cardSeparator: 'newline',
  sideSeparator: 'tab',
};

export function parseCardImport(
  source: string,
  options: CardImportOptions = defaultCardImportOptions,
): CardImportResult {
  const cardSeparator = resolveSeparator(options.cardSeparator, options.customCardSeparator, '\n');
  const sideSeparator = resolveSeparator(options.sideSeparator, options.customSideSeparator, '\t');
  if (!cardSeparator || !sideSeparator) return { cards: [], skipped: source.trim() ? 1 : 0 };

  let skipped = 0;
  const cards = source
    .replace(/\r\n?/g, '\n')
    .split(cardSeparator)
    .map((row) => row.trim())
    .filter(Boolean)
    .flatMap((row) => {
      const separatorIndex = row.indexOf(sideSeparator);
      if (separatorIndex < 0) {
        skipped += 1;
        return [];
      }
      const term = row.slice(0, separatorIndex).trim();
      const definition = row.slice(separatorIndex + sideSeparator.length).trim();
      if (!term || !definition) {
        skipped += 1;
        return [];
      }
      return [{ term, definition }];
    });
  return { cards, skipped };
}

function resolveSeparator(
  kind: CardSeparator | SideSeparator,
  custom: string | undefined,
  fallback: string,
): string {
  if (kind === 'custom') return custom ?? '';
  if (kind === 'newline') return '\n';
  if (kind === 'semicolon') return ';';
  if (kind === 'comma') return ',';
  return fallback;
}
