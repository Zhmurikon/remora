/**
 * Доменные типы, общие для обоих фронтендов.
 * Источник истины по API-схемам — сгенерированный @remora/api-client;
 * здесь только то, что живёт и на клиенте тоже (режимы, состояния, ключи лимитов).
 */

/** Режимы обучения. Значения совпадают с enum на бэкенде. */
export const STUDY_MODES = ['flashcards', 'learn', 'test', 'write', 'listen'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  flashcards: 'Карточки',
  learn: 'Заучивание',
  test: 'Тест',
  write: 'Письмо',
  listen: 'Аудирование',
};

/** Состояние карточки в терминах FSRS. */
export const CARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type CardState = (typeof CARD_STATES)[number];

/** Направление изучения. Состояния FSRS хранятся раздельно по направлениям. */
export type StudyDirection = 'term_to_def' | 'def_to_term';

/** Оценка ответа в FSRS. */
export const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export type Rating = (typeof RATINGS)[keyof typeof RATINGS];

/** Видимость набора. */
export type SetVisibility = 'private' | 'unlisted' | 'public';

/** Роли пользователя в системе. */
export type UserRole = 'user' | 'teacher' | 'moderator' | 'admin';

/** Роли внутри класса. */
export type ClassRole = 'teacher' | 'assistant' | 'student';

/** Тарифы. */
export const PLAN_CODES = ['free', 'plus', 'teach', 'school'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/**
 * Ключи лимитов. Совпадают с ключами YAML-конфига на бэкенде и с полем
 * details.limit_key в ошибке LIMIT_EXCEEDED — по нему клиент выбирает экран.
 * Полные значения см. docs/04-limits.md.
 */
export const LIMIT_KEYS = [
  'sets.max',
  'cards.per_set',
  'cards.total',
  'folders.max',
  'images.total',
  'images.max_size',
  'tts.chars_per_month',
  'import.per_day',
  'import.cards_per_run',
  'copy.per_day',
  'export.account_per_day',
  'classes.max',
  'classes.students_max',
  'assignments.active_max',
  'test.questions_max',
  'exam_plans.active_max',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Тело ошибки превышения лимита. */
export interface LimitExceededDetails {
  limit_key: LimitKey;
  limit: number;
  current: number;
  requested: number;
  /** ISO-дата сброса для счётчиков за период; null для квот состояния. */
  resets_at: string | null;
  upgrade_to: PlanCode | null;
}
