export interface EditorialCollection {
  slug: string;
  status: 'draft' | 'published';
  title: string;
  description: string;
  introduction: string;
  publishedAt: string;
  updatedAt: string;
  tone: 'mint' | 'lavender' | 'peach';
  courses: readonly { id: string; note: string }[];
}

// UUID берём из API курса: они не меняются при переименовании или смене slug.
export const editorialCollections: readonly EditorialCollection[] = [
  {
    slug: 'k-pervomu-zachetu',
    status: 'published',
    title: 'К первому зачёту',
    description:
      'Три технических курса для подготовки: основы вероятностей и анализа данных, устройство Git и работа с удалённым репозиторием.',
    introduction:
      'Выберите нужную тему и сначала пройдите теорию целиком. После чтения проверьте себя по карточкам, а сложные вопросы оставьте для интервального повторения. Уроки по Git лучше проходить по порядку.',
    publishedAt: '2026-09-29',
    updatedAt: '2026-09-29',
    tone: 'mint',
    courses: [
      {
        id: '7499b5e0-0b85-4048-a5d6-f0b071e44af8',
        note: 'Подробный конспект по вероятностям, статистике и анализу данных в Python с 388 карточками для самопроверки.',
      },
      {
        id: 'c89dda88-3539-461a-8383-35ff3d00068b',
        note: 'Первый урок по Git: репозиторий, рабочая директория, индекс, коммиты и типичные ошибки в базовом сценарии.',
      },
      {
        id: '8bf82603-7c9f-486f-9311-3707a61bb34c',
        note: 'Продолжение курса по Git: remote и origin, отправка и получение изменений, просмотр истории и различий.',
      },
    ],
  },
  {
    slug: 'yazyki-ponemnogu',
    status: 'draft',
    title: 'Языки понемногу',
    description: 'Курсы для знакомства со словами и выражениями и коротких повторений.',
    introduction:
      'Выберите знакомую тему и проверьте, какие слова удаётся вспомнить самостоятельно. Для практики в обратную сторону поменяйте направление карточек в настройках обучения.',
    publishedAt: '2026-09-18',
    updatedAt: '2026-09-18',
    tone: 'lavender',
    courses: [],
  },
];
