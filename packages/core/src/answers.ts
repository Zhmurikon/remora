/**
 * Нормализация и сравнение ответов для режимов «Письмо», «Тест» и «Аудирование».
 *
 * Логика продублирована на Python (`apps/api/app/core/answers.py`): клиент
 * показывает вердикт мгновенно, сервер проверяет ответы теста заново и не
 * доверяет клиенту. Расхождение двух реализаций означало бы, что человек видит
 * «верно», а в результатах теста получает ошибку, поэтому обе проверяются одним
 * набором кейсов — `answer-cases.json`.
 *
 * Отдельный статус «опечатка» существует, чтобы промах по клавише не ломал
 * расписание: ошибкой это не считается, но ответ нужно ввести заново.
 */

export type Strictness = 'strict' | 'moderate' | 'lenient';
export type AnswerVerdict = 'correct' | 'typo' | 'incorrect';

export const STRICTNESS_LEVELS = ['strict', 'moderate', 'lenient'] as const;

export const STRICTNESS_LABELS: Record<Strictness, string> = {
  strict: 'Строго',
  moderate: 'Умеренно',
  lenient: 'Мягко',
};

export interface AnswerOptions {
  strictness?: Strictness;
  /** Синонимы, которые тоже засчитываются (`alt_answers` карточки). */
  alternatives?: readonly string[];
  /** Язык ответа. Для не-русского отбрасываются артикли. */
  lang?: string;
}

export interface AnswerResult {
  verdict: AnswerVerdict;
  /** Вариант, с которым ответ совпал или к которому оказался ближе всего. */
  matched: string | null;
  /** Расстояние Левенштейна до ближайшего варианта после нормализации. */
  distance: number;
}

/**
 * Апострофы удаляются, остальная пунктуация заменяется пробелом:
 * «don't» → «dont», но «кошка,собака» → «кошка собака».
 */
const APOSTROPHES = /['’ʼ`´]/g;
const PUNCTUATION = /[.,;:!?«»„“”"()[\]{}<>/\\|—–\-_…*+=~^&%$#@]/g;
/**
 * Диакритика снимается только с латиницы. В кириллице «й» — это «и» с кратким,
 * и слепая свёртка приравняла бы «мой» к «мои». «ё» приводится к «е» отдельно:
 * это привычная замена, а не потеря буквы, и работает во всех режимах.
 */
const LATIN_DIACRITICS = /([a-z])[\u0300-\u036f]+/g;

/** Артикли отбрасываются только в начале ответа и только для не-русских языков. */
const ARTICLES: Record<string, readonly string[]> = {
  en: ['a', 'an', 'the'],
  de: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'],
  fr: ['le', 'la', 'les', 'un', 'une', 'des', "l'", 'du', 'de'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'],
  it: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una'],
};

/**
 * Допуск на опечатку по длине ожидаемого ответа. Таблицами, а не формулой:
 * значения должны совпадать с Python до единицы, а формулу легко разойтись
 * в округлении.
 */
const TYPO_THRESHOLDS: Record<Strictness, readonly (readonly [number, number])[]> = {
  // [максимальная длина, допустимое расстояние]
  strict: [[Infinity, 0]],
  moderate: [
    [3, 0],
    [7, 1],
    [Infinity, 2],
  ],
  lenient: [
    [2, 0],
    [5, 1],
    [10, 2],
    [Infinity, 3],
  ],
};

export function normalizeAnswer(value: string, options: AnswerOptions = {}): string {
  const strictness = options.strictness ?? 'moderate';
  let result = value.trim().toLowerCase().replace(/ё/g, 'е');

  if (strictness !== 'strict') {
    result = result.normalize('NFD').replace(LATIN_DIACRITICS, '$1').normalize('NFC');
    result = result.replace(APOSTROPHES, '').replace(PUNCTUATION, ' ');
  }

  result = result.replace(/\s+/g, ' ').trim();

  if (strictness !== 'strict') {
    result = stripArticle(result, options.lang);
  }
  return result;
}

export function checkAnswer(
  typed: string,
  expected: string,
  options: AnswerOptions = {},
): AnswerResult {
  const strictness = options.strictness ?? 'moderate';
  const candidates = [expected, ...(options.alternatives ?? [])];
  const normalizedTyped = normalizeAnswer(typed, options);

  if (normalizedTyped.length === 0) {
    return { verdict: 'incorrect', matched: null, distance: Infinity };
  }

  let best: AnswerResult = { verdict: 'incorrect', matched: null, distance: Infinity };
  for (const candidate of candidates) {
    const normalized = normalizeAnswer(candidate, options);
    if (normalized.length === 0) continue;
    if (normalized === normalizedTyped) {
      return { verdict: 'correct', matched: candidate, distance: 0 };
    }
    const distance = levenshtein(normalizedTyped, normalized);
    if (distance < best.distance) {
      best = {
        verdict: distance <= typoThreshold(normalized.length, strictness) ? 'typo' : 'incorrect',
        matched: candidate,
        distance,
      };
    }
  }
  return best;
}

/** Допустимое расстояние, при котором ответ считается опечаткой, а не ошибкой. */
export function typoThreshold(length: number, strictness: Strictness = 'moderate'): number {
  for (const [maxLength, threshold] of TYPO_THRESHOLDS[strictness]) {
    if (length <= maxLength) return threshold;
  }
  return 0;
}

/** Расстояние Левенштейна. Итеративная версия на двух строках. */
export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length]!;
}

/** Процент посимвольного совпадения после той же нормализации, что и у проверки ответа. */
export function answerSimilarity(
  typed: string,
  expected: string,
  options: AnswerOptions = {},
): number {
  const left = normalizeAnswer(typed, options);
  const right = normalizeAnswer(expected, options);
  if (left.length === 0 || right.length === 0) return 0;
  const longest = Math.max(left.length, right.length);
  return Math.round((1 - levenshtein(left, right) / longest) * 100);
}

function stripArticle(value: string, lang: string | undefined): string {
  const articles = ARTICLES[(lang ?? 'ru').slice(0, 2).toLowerCase()];
  if (!articles) return value;
  const spaceAt = value.indexOf(' ');
  if (spaceAt === -1) return value;
  const head = value.slice(0, spaceAt);
  // Односложный ответ не трогаем: «the» как ответ на «определённый артикль»
  // должен остаться собой.
  return articles.includes(head) ? value.slice(spaceAt + 1) : value;
}
