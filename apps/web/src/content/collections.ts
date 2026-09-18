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

// До редакционного отбора реальных курсов заготовки не публикуются.
// UUID берём из API курса: они не меняются при переименовании или смене slug.
export const editorialCollections: readonly EditorialCollection[] = [
  {
    slug: 'k-pervomu-zachetu',
    status: 'draft',
    title: 'К первому зачёту',
    description: 'Курсы с базовыми понятиями: разобраться в теме и проверить себя по карточкам.',
    introduction:
      'Начните с темы, которую проходите сейчас. Прочитайте теорию, затем попробуйте ответить на вопросы без подсказок. Сложные карточки оставьте для следующего повторения.',
    publishedAt: '2026-09-18',
    updatedAt: '2026-09-18',
    tone: 'mint',
    courses: [],
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
