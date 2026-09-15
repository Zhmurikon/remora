/** Форматирование, общее для обоих фронтендов. */

const PLURAL_RULES = new Intl.PluralRules('ru-RU');

/**
 * Русское склонение числительных.
 * plural(5, ['карточка', 'карточки', 'карточек']) → 'карточек'
 */
export function plural(count: number, forms: [string, string, string]): string {
  const category = PLURAL_RULES.select(count);
  if (category === 'one') return forms[0];
  if (category === 'few') return forms[1];
  return forms[2];
}

export function pluralWithCount(count: number, forms: [string, string, string]): string {
  return `${count} ${plural(count, forms)}`;
}

/**
 * Человекочитаемый интервал повторения: 0.5 → «12 часов», 45 → «1.5 месяца».
 * Шаги заучивания измеряются минутами, поэтому минуты тоже нужны:
 * «1 час» на кнопке вместо «1 мин» — прямая ложь пользователю.
 */
export function formatInterval(days: number): string {
  if (days < 1 / 24) {
    const minutes = Math.max(1, Math.round(days * 24 * 60));
    return pluralWithCount(minutes, ['минута', 'минуты', 'минут']);
  }
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return pluralWithCount(hours, ['час', 'часа', 'часов']);
  }
  if (days < 30) {
    const d = Math.round(days);
    return pluralWithCount(d, ['день', 'дня', 'дней']);
  }
  if (days < 365) {
    const months = Math.round((days / 30.4) * 10) / 10;
    return `${months} ${plural(Math.round(months), ['месяц', 'месяца', 'месяцев'])}`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} ${plural(Math.round(years), ['год', 'года', 'лет'])}`;
}

/** То же, но от секунд: планировщик отдаёт интервалы именно в них. */
export function formatIntervalSeconds(seconds: number): string {
  return formatInterval(seconds / 86_400);
}

/** Размер файла для сообщений о лимитах. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} МБ`;
}
