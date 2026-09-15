/**
 * Порт FSRS-6 на TypeScript — только для предпросмотра интервалов на кнопках.
 *
 * Расписание считает сервер, здесь не источник истины. Порт нужен, чтобы
 * подписать кнопки самооценки («через 10 минут» / «через 3 дня») без запроса
 * к API на каждый ответ, и чтобы после ответа офлайн интерфейс мог показать
 * ожидаемый срок до синхронизации.
 *
 * Совпадение с сервером проверяется тестом по золотым фикстурам
 * (`fsrs-cases.json`), которые генерирует сам серверный SchedulerService.
 * Две вещи, из-за которых расчёты разошлись бы, учтены здесь намеренно:
 * fuzzing выключен на сервере, а округление интервала в Python банковское.
 *
 * Параметры и шаги обязаны совпадать с app/services/scheduler.py.
 */

import type { CardState, Rating } from './domain';

export const SCHEDULER_VERSION = 'fsrs6-v1';

const PARAMETERS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const;

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Шаги заучивания и переучивания в миллисекундах. */
const LEARNING_STEPS: readonly number[] = [1 * MINUTE, 10 * MINUTE];
const RELEARNING_STEPS: readonly number[] = [10 * MINUTE];

/** Начальная стабильность по оценке — первые четыре параметра модели. */
const INITIAL_STABILITY: Record<Rating, number> = {
  1: PARAMETERS[0],
  2: PARAMETERS[1],
  3: PARAMETERS[2],
  4: PARAMETERS[3],
};

const STABILITY_MIN = 0.001;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

export const MIN_DESIRED_RETENTION = 0.7;
export const MAX_DESIRED_RETENTION = 0.98;
export const MAX_INTERVAL_DAYS_LIMIT = 36500;

const DECAY = -PARAMETERS[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

export interface SchedulerOptions {
  /** Целевое удержание: доля карточек, которые пользователь должен вспомнить. */
  desiredRetention?: number;
  maximumIntervalDays?: number;
}

/** Состояние карточки в терминах планировщика. Зеркало SchedulerState на сервере. */
export interface FsrsState {
  state: CardState;
  stability: number | null;
  difficulty: number | null;
  /** Номер шага заучивания; null для карточек в состоянии review. */
  step: number | null;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

export interface IntervalPreview {
  rating: Rating;
  dueAt: Date;
  intervalSeconds: number;
}

/** Карточка, которую ещё ни разу не показывали. */
export function initialState(dueAt: Date): FsrsState {
  return { state: 'new', stability: null, difficulty: null, step: 0, dueAt, lastReviewedAt: null };
}

/** Применяет ответ и возвращает новое состояние. */
export function review(
  state: FsrsState,
  rating: Rating,
  reviewedAt: Date,
  options: SchedulerOptions = {},
): FsrsState {
  const desiredRetention = clamp(
    options.desiredRetention ?? 0.9,
    MIN_DESIRED_RETENTION,
    MAX_DESIRED_RETENTION,
  );
  const maximumIntervalDays = Math.trunc(
    clamp(options.maximumIntervalDays ?? 365, 1, MAX_INTERVAL_DAYS_LIMIT),
  );
  const moment = reviewedAt.getTime();

  // Новая карточка в терминах FSRS — нулевой шаг заучивания без истории.
  const current: FsrsState =
    state.state === 'new'
      ? { ...state, state: 'learning', step: 0, stability: null, difficulty: null }
      : state;

  const daysSinceLastReview =
    current.lastReviewedAt === null
      ? null
      : Math.floor((moment - current.lastReviewedAt.getTime()) / DAY);

  let stability = current.stability;
  let difficulty = current.difficulty;
  let nextState: CardState = current.state;
  let step = current.step;
  let intervalMs: number;

  const toReview = (): number => {
    nextState = 'review';
    step = null;
    return nextIntervalDays(stability!, desiredRetention, maximumIntervalDays) * DAY;
  };

  if (current.state === 'learning' || current.state === 'relearning') {
    const steps = current.state === 'learning' ? LEARNING_STEPS : RELEARNING_STEPS;
    const stepAt = (index: number): number => steps[index] ?? steps[steps.length - 1] ?? DAY;
    if (stability === null || difficulty === null) {
      stability = clampStability(INITIAL_STABILITY[rating]);
      difficulty = clampDifficulty(initialDifficulty(rating));
    } else if (daysSinceLastReview !== null && daysSinceLastReview < 1) {
      stability = shortTermStability(stability, rating);
      difficulty = nextDifficulty(difficulty, rating);
    } else {
      stability = nextStability(
        difficulty,
        stability,
        retrievability(stability, current.lastReviewedAt, moment),
        rating,
      );
      difficulty = nextDifficulty(difficulty, rating);
    }

    const currentStep = step ?? 0;
    if (steps.length === 0 || (currentStep >= steps.length && rating > 1)) {
      intervalMs = toReview();
    } else if (rating === 1) {
      step = 0;
      intervalMs = stepAt(0);
    } else if (rating === 2) {
      // «Трудно» не двигает шаг: при единственном шаге растягиваем его в полтора раза,
      // иначе берём середину между первым и вторым.
      if (currentStep === 0 && steps.length === 1) intervalMs = stepAt(0) * 1.5;
      else if (currentStep === 0) intervalMs = (stepAt(0) + stepAt(1)) / 2;
      else intervalMs = stepAt(currentStep);
    } else if (rating === 3) {
      if (currentStep + 1 === steps.length) {
        intervalMs = toReview();
      } else {
        step = currentStep + 1;
        intervalMs = stepAt(step);
      }
    } else {
      intervalMs = toReview();
    }
  } else {
    if (daysSinceLastReview !== null && daysSinceLastReview < 1) {
      stability = shortTermStability(stability!, rating);
    } else {
      stability = nextStability(
        difficulty!,
        stability!,
        retrievability(stability!, current.lastReviewedAt, moment),
        rating,
      );
    }
    difficulty = nextDifficulty(difficulty!, rating);

    if (rating === 1) {
      nextState = 'relearning';
      step = 0;
      intervalMs = RELEARNING_STEPS[0] ?? DAY;
    } else {
      intervalMs = nextIntervalDays(stability, desiredRetention, maximumIntervalDays) * DAY;
    }
  }

  return {
    state: nextState,
    stability,
    difficulty,
    step,
    dueAt: new Date(moment + intervalMs),
    lastReviewedAt: new Date(moment),
  };
}

/** Интервалы для всех четырёх оценок — подписи на кнопках самооценки. */
export function previewIntervals(
  state: FsrsState,
  now: Date,
  options: SchedulerOptions = {},
): IntervalPreview[] {
  return ([1, 2, 3, 4] as const).map((rating) => {
    const after = review(state, rating, now, options);
    return {
      rating,
      dueAt: after.dueAt,
      intervalSeconds: Math.max(0, Math.round((after.dueAt.getTime() - now.getTime()) / 1000)),
    };
  });
}

function retrievability(stability: number, lastReviewedAt: Date | null, moment: number): number {
  if (lastReviewedAt === null) return 0;
  const elapsedDays = Math.max(0, Math.floor((moment - lastReviewedAt.getTime()) / DAY));
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function nextIntervalDays(
  stability: number,
  desiredRetention: number,
  maximumIntervalDays: number,
): number {
  const raw = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
  return Math.min(Math.max(roundHalfToEven(raw), 1), maximumIntervalDays);
}

function initialDifficulty(rating: Rating): number {
  return PARAMETERS[4] - Math.exp(PARAMETERS[5] * (rating - 1)) + 1;
}

function shortTermStability(stability: number, rating: Rating): number {
  let increase =
    Math.exp(PARAMETERS[17] * (rating - 3 + PARAMETERS[18])) * Math.pow(stability, -PARAMETERS[19]);
  if (rating > 1) increase = Math.max(increase, 1);
  return clampStability(stability * increase);
}

function nextDifficulty(difficulty: number, rating: Rating): number {
  const easyInitial = initialDifficulty(4);
  const deltaDifficulty = -(PARAMETERS[6] * (rating - 3));
  const damped = difficulty + ((10 - difficulty) * deltaDifficulty) / 9;
  return clampDifficulty(PARAMETERS[7] * easyInitial + (1 - PARAMETERS[7]) * damped);
}

function nextStability(
  difficulty: number,
  stability: number,
  retention: number,
  rating: Rating,
): number {
  if (rating === 1) {
    const longTerm =
      PARAMETERS[11] *
      Math.pow(difficulty, -PARAMETERS[12]) *
      (Math.pow(stability + 1, PARAMETERS[13]) - 1) *
      Math.exp((1 - retention) * PARAMETERS[14]);
    const shortTerm = stability / Math.exp(PARAMETERS[17] * PARAMETERS[18]);
    return clampStability(Math.min(longTerm, shortTerm));
  }
  const hardPenalty = rating === 2 ? PARAMETERS[15] : 1;
  const easyBonus = rating === 4 ? PARAMETERS[16] : 1;
  return clampStability(
    stability *
      (1 +
        Math.exp(PARAMETERS[8]) *
          (11 - difficulty) *
          Math.pow(stability, -PARAMETERS[9]) *
          (Math.exp((1 - retention) * PARAMETERS[10]) - 1) *
          hardPenalty *
          easyBonus),
  );
}

/**
 * Округление «до чётного», как встроенный round() в Python. Обычный Math.round
 * дал бы на .5 другой день, и предпросмотр разошёлся бы с сервером.
 */
function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function clampStability(value: number): number {
  return Math.max(value, STABILITY_MIN);
}

function clampDifficulty(value: number): number {
  return clamp(value, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
