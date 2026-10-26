export type BillingInterval = 'month' | 'year';
export type PaidPlanCode = 'plus' | 'pro';

export type PublicPlan = {
  code: 'free' | PaidPlanCode;
  name: string;
  description: string;
  monthPrice: number;
  yearPrice: number;
  yearMonthlyPrice: number;
  features: readonly string[];
};

export const publicPlans: readonly PublicPlan[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'Для учёбы по своим материалам без рекламы и ограничений на занятия.',
    monthPrice: 0,
    yearPrice: 0,
    yearMonthlyPrice: 0,
    features: [
      '10 курсов и 20 наборов',
      'Все режимы и FSRS-повторения',
      '500 записей через MCP в неделю',
      'Экспорт своих данных',
    ],
  },
  {
    code: 'plus',
    name: 'Plus',
    description:
      'Для тех, кто собирает большую библиотеку, преподаёт или автоматизирует подготовку.',
    monthPrice: 299,
    yearPrice: 2499,
    yearMonthlyPrice: 208,
    features: [
      'Курсы, наборы и MCP без лимита',
      '300 минут расшифровки в неделю',
      '500 000 токенов генерации в неделю',
      'Полный преподавательский контур',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Для интенсивной расшифровки и генерации больших объёмов материалов.',
    monthPrice: 999,
    yearPrice: 9999,
    yearMonthlyPrice: 833,
    features: [
      'Всё из Plus',
      '1 500 минут расшифровки в неделю',
      '2,5 млн токенов генерации в неделю',
      'Повышенные ИИ-квоты',
    ],
  },
] as const;

export function formatRubles(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽';
}
