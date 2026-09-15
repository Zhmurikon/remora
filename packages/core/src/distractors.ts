/**
 * Варианты ответа для вопросов с выбором в режиме «Заучивание».
 *
 * Дистракторы берём из того же набора: «выбери перевод» с вариантами из другой
 * темы решается по одному взгляду и ничему не учит. Близость на MVP считаем без
 * ИИ — по длине, первым буквам и общим словам. Этого достаточно, чтобы в
 * вариантах оказались похожие термины, а не случайный шум.
 *
 * Порядок вариантов детерминирован по `seed`: при каждом ре-рендере карточки
 * правильный ответ обязан оставаться на том же месте, иначе пользователь
 * промахивается по уезжающей кнопке.
 */

export interface DistractorOptions {
  /** Правильный ответ. */
  correct: string;
  /** Остальные ответы набора — источник дистракторов. */
  pool: readonly string[];
  /** Сколько всего вариантов показать, включая правильный. */
  count?: number;
  /** Обычно id карточки: фиксирует порядок вариантов между рендерами. */
  seed: string;
}

export const DEFAULT_OPTION_COUNT = 4;

export function generateOptions({
  correct,
  pool,
  count = DEFAULT_OPTION_COUNT,
  seed,
}: DistractorOptions): string[] {
  const normalizedCorrect = normalize(correct);
  const seen = new Set([normalizedCorrect]);
  const candidates: string[] = [];
  for (const candidate of pool) {
    const key = normalize(candidate);
    // Дубликат или синоним, совпадающий с правильным ответом, превратил бы
    // вопрос в задачу без верного решения.
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }

  const random = createRandom(seed);
  const ranked = candidates
    .map((candidate, index) => ({
      candidate,
      // Небольшой случайный вес, чтобы одни и те же соседи не всплывали
      // в каждом вопросе, но порядок оставался воспроизводимым по seed.
      score: similarity(correct, candidate) + random() * 0.15,
      index,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const options = [
    correct,
    ...ranked.slice(0, Math.max(0, count - 1)).map((item) => item.candidate),
  ];
  return shuffle(options, createRandom(`${seed}:order`));
}

/** Достаточно ли материала в наборе, чтобы спрашивать выбором из нескольких. */
export function canAskMultipleChoice(
  pool: readonly string[],
  count = DEFAULT_OPTION_COUNT,
): boolean {
  return new Set(pool.map(normalize).filter((value) => value.length > 0)).size >= count - 1;
}

/** Грубая мера похожести двух ответов: 0 — ничего общего, 1 — почти одно и то же. */
export function similarity(left: string, right: string): number {
  const first = normalize(left);
  const second = normalize(right);
  if (first.length === 0 || second.length === 0) return 0;

  const lengthScore =
    1 - Math.abs(first.length - second.length) / Math.max(first.length, second.length);

  let prefix = 0;
  while (prefix < first.length && prefix < second.length && first[prefix] === second[prefix]) {
    prefix += 1;
  }
  const prefixScore = prefix / Math.min(first.length, second.length);

  const firstWords = new Set(first.split(/\s+/));
  const secondWords = second.split(/\s+/);
  const shared = secondWords.filter((word) => firstWords.has(word)).length;
  const wordScore = shared / Math.max(firstWords.size, secondWords.length);

  return lengthScore * 0.4 + prefixScore * 0.35 + wordScore * 0.25;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

/** Воспроизводимый генератор: один и тот же seed даёт одну и ту же последовательность. */
function createRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}
