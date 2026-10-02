export const LEGAL_CONTACT_EMAIL = 'support@remora.com.ru';
export const LEGAL_UPDATED_AT = '2026-10-02';

export type LegalLanguage = 'ru' | 'en';
export type LegalDocumentKind = 'privacy' | 'terms';

interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  contact?: boolean;
}

export interface LegalDocument {
  title: string;
  description: string;
  eyebrow: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const privacyRu: LegalDocument = {
  title: 'Политика конфиденциальности',
  description: 'Как Remora получает, использует, хранит и защищает данные пользователей.',
  eyebrow: 'Конфиденциальность',
  updated: 'Обновлено 2 октября 2026 года',
  intro:
    'Эта политика объясняет, какие данные обрабатывает Remora, зачем они нужны и как вы можете управлять ими. Она действует для сайта remora.com.ru и связанных приложений Remora.',
  sections: [
    {
      title: '1. Кто обрабатывает данные',
      paragraphs: [
        'Данные обрабатывает администратор сервиса Remora. По вопросам конфиденциальности, доступа к данным или их удаления напишите нам.',
      ],
      contact: true,
    },
    {
      title: '2. Какие данные мы получаем',
      bullets: [
        'Данные аккаунта: адрес электронной почты, имя пользователя, отображаемое имя, дата рождения и аватар.',
        'Учебные данные: созданные курсы, наборы и карточки, ответы, прогресс, расписание повторений и настройки обучения.',
        'Загруженные материалы и обращения в поддержку.',
        'Технические данные: IP-адрес, тип устройства и браузера, сведения о сеансах, необходимые cookie и журналы безопасности.',
      ],
    },
    {
      title: '3. Вход через Google',
      paragraphs: [
        'Если вы выбираете вход через Google, Remora получает уникальный идентификатор Google-аккаунта, подтверждённый адрес электронной почты и, если они доступны, имя и изображение профиля. Эти данные нужны только для создания аккаунта Remora, входа и безопасного связывания с существующим аккаунтом по тому же адресу.',
        'Remora запрашивает только разрешения openid, email и profile. Мы не получаем доступ к Gmail, Google Drive, контактам или другим данным Google и не сохраняем токен доступа Google после завершения авторизации.',
        'Данные Google не продаются, не передаются рекламным платформам и не используются для персонализированной рекламы.',
      ],
    },
    {
      title: '4. Для чего нужны данные',
      bullets: [
        'регистрировать пользователей, подтверждать вход и поддерживать работу аккаунта;',
        'сохранять учебные материалы, рассчитывать расписание повторений и показывать прогресс;',
        'обрабатывать загрузки, обращения и выбранные пользователем функции;',
        'защищать сервис от взлома, спама, мошенничества и других нарушений;',
        'выполнять требования закона и защищать права пользователей и сервиса.',
      ],
    },
    {
      title: '5. Правовые основания',
      paragraphs: [
        'Мы обрабатываем данные, когда это необходимо для предоставления сервиса по условиям использования, на основании вашего согласия или для выполнения требований применимого законодательства. Согласие можно отозвать, но после этого часть функций или весь аккаунт могут стать недоступны.',
      ],
    },
    {
      title: '6. Кому могут передаваться данные',
      paragraphs: [
        'Мы можем привлекать поставщиков инфраструктуры, хранения файлов, электронной почты и других технических услуг. Они получают только данные, необходимые для своей задачи, и должны защищать их. Данные также могут быть раскрыты государственным органам, если этого требует закон.',
        'Мы не продаём персональные данные. Передача новому владельцу сервиса возможна только вместе с обязательствами по этой политике и с уведомлением пользователей, когда оно требуется.',
      ],
    },
    {
      title: '7. Cookie и сеансы',
      paragraphs: [
        'Remora использует необходимые cookie для входа, защиты сеанса и сохранения базовых настроек. Без них авторизация и часть функций не работают. Сейчас мы не используем рекламные cookie.',
      ],
    },
    {
      title: '8. Срок хранения и защита',
      paragraphs: [
        'Мы храним данные, пока существует аккаунт или пока они нужны для описанных целей. После удаления аккаунта данные удаляются или обезличиваются в разумный срок, кроме сведений, которые необходимо сохранить по закону, для безопасности или разрешения споров.',
        'Мы ограничиваем доступ к данным, используем защищённое соединение и храним секреты аутентификации в защищённом виде. Ни один способ хранения не гарантирует абсолютную безопасность, поэтому мы регулярно пересматриваем меры защиты.',
      ],
    },
    {
      title: '9. Ваши права',
      paragraphs: [
        'Вы можете запросить сведения о своих данных, исправить их, получить доступную копию, отозвать согласие или попросить удалить аккаунт и данные. Мы можем попросить подтвердить личность перед выполнением запроса.',
        'Пользователям младше 14 лет следует использовать Remora только с согласия законного представителя.',
      ],
      contact: true,
    },
    {
      title: '10. Изменения политики',
      paragraphs: [
        'Мы можем обновлять эту политику при изменении сервиса или требований закона. Актуальная версия всегда опубликована на этой странице; дату последнего обновления мы указываем в начале документа.',
      ],
    },
  ],
};

const privacyEn: LegalDocument = {
  title: 'Privacy Policy',
  description: 'How Remora collects, uses, stores, and protects user data.',
  eyebrow: 'Privacy',
  updated: 'Updated October 2, 2026',
  intro:
    'This policy explains what data Remora processes, why it is needed, and how you can manage it. It applies to remora.com.ru and related Remora applications.',
  sections: [
    {
      title: '1. Who processes your data',
      paragraphs: [
        'Your data is processed by the administrator of the Remora service. Contact us with questions about privacy, access to your data, or deletion requests.',
      ],
      contact: true,
    },
    {
      title: '2. Data we collect',
      bullets: [
        'Account data: email address, username, display name, date of birth, and avatar.',
        'Learning data: courses, sets and cards you create, answers, progress, review schedules, and learning settings.',
        'Materials you upload and messages you send to support.',
        'Technical data: IP address, device and browser type, session information, essential cookies, and security logs.',
      ],
    },
    {
      title: '3. Sign in with Google',
      paragraphs: [
        'When you choose Sign in with Google, Remora receives your unique Google Account identifier, verified email address and, when available, your name and profile picture. We use this data only to create your Remora account, sign you in, and securely link it to an existing account with the same email address.',
        'Remora requests only the openid, email, and profile permissions. We do not access Gmail, Google Drive, contacts, or other Google data, and we do not retain the Google access token after authentication is complete.',
        'Google user data is not sold, shared with advertising platforms, or used for personalized advertising.',
      ],
    },
    {
      title: '4. Why we use data',
      bullets: [
        'to register users, authenticate them, and maintain their accounts;',
        'to store learning materials, calculate review schedules, and show progress;',
        'to process uploads, support requests, and features selected by the user;',
        'to protect the service against unauthorized access, spam, fraud, and abuse;',
        'to comply with the law and protect the rights of users and the service.',
      ],
    },
    {
      title: '5. Legal bases',
      paragraphs: [
        'We process data when necessary to provide the service under the Terms of Use, with your consent, or to comply with applicable law. You may withdraw consent, but some features or your entire account may then become unavailable.',
      ],
    },
    {
      title: '6. When data may be shared',
      paragraphs: [
        'We may use providers of infrastructure, file storage, email, and other technical services. They receive only the data required for their task and must protect it. We may also disclose data to public authorities when required by law.',
        'We do not sell personal data. Data may be transferred to a new owner of the service only together with the obligations in this policy and with notice to users where required.',
      ],
    },
    {
      title: '7. Cookies and sessions',
      paragraphs: [
        'Remora uses essential cookies to sign you in, protect your session, and remember basic settings. Authentication and some features cannot work without them. We currently do not use advertising cookies.',
      ],
    },
    {
      title: '8. Retention and security',
      paragraphs: [
        'We keep data while your account exists or while it is needed for the purposes described above. After account deletion, data is deleted or anonymized within a reasonable period, except where retention is required by law, security needs, or dispute resolution.',
        'We restrict access to data, use secure connections, and protect authentication secrets. No storage method can guarantee absolute security, so we regularly review our safeguards.',
      ],
    },
    {
      title: '9. Your rights',
      paragraphs: [
        'You may ask what data we hold about you, correct it, receive an available copy, withdraw consent, or request deletion of your account and data. We may ask you to verify your identity before completing a request.',
        'Users under 14 should use Remora only with the consent of a parent or legal guardian.',
      ],
      contact: true,
    },
    {
      title: '10. Changes to this policy',
      paragraphs: [
        'We may update this policy when the service or legal requirements change. The current version is always published on this page, with the latest update date shown at the top.',
      ],
    },
  ],
};

const termsRu: LegalDocument = {
  title: 'Условия использования',
  description: 'Основные правила использования сайта и приложений Remora.',
  eyebrow: 'Правила сервиса',
  updated: 'Обновлено 2 октября 2026 года',
  intro:
    'Эти условия регулируют использование сайта remora.com.ru и связанных приложений Remora. Создавая аккаунт или продолжая пользоваться сервисом, вы соглашаетесь с ними.',
  sections: [
    {
      title: '1. О сервисе',
      paragraphs: [
        'Remora помогает создавать и изучать карточки, курсы и другие учебные материалы. Сервис предоставляет инструменты для самостоятельного обучения, но не гарантирует конкретный учебный результат и не заменяет профессиональную консультацию.',
      ],
    },
    {
      title: '2. Аккаунт',
      paragraphs: [
        'Указывайте актуальные данные и защищайте доступ к аккаунту. Вы отвечаете за действия, совершённые через ваш аккаунт, пока не сообщите нам о несанкционированном доступе.',
        'Один Google-аккаунт может быть связан с существующим аккаунтом Remora с тем же подтверждённым адресом электронной почты. Если безопасно подтвердить совпадение нельзя, Remora может запросить дополнительное подтверждение.',
        'Пользователи младше 14 лет могут пользоваться сервисом только с согласия законного представителя.',
      ],
    },
    {
      title: '3. Материалы пользователя',
      paragraphs: [
        'Вы сохраняете права на материалы, которые добавляете в Remora. Вы предоставляете нам ограниченное право хранить, обрабатывать, преобразовывать и показывать их только в объёме, необходимом для работы выбранных функций и настроек доступа.',
        'Вы отвечаете за законность материалов и наличие прав на их использование. Не публикуйте персональные данные других людей без законного основания.',
      ],
    },
    {
      title: '4. Что запрещено',
      bullets: [
        'нарушать закон, чужие авторские права, конфиденциальность или иные права;',
        'загружать вредоносный код, опасные или заведомо незаконные материалы;',
        'мешать работе сервиса, обходить ограничения, получать чужие данные или доступ;',
        'использовать автоматизацию для спама, перегрузки или злоупотребления сервисом;',
        'выдавать себя за другого человека или вводить пользователей в заблуждение.',
      ],
    },
    {
      title: '5. Публичные материалы',
      paragraphs: [
        'Материалы с публичным доступом могут видеть другие пользователи и поисковые системы. Перед публикацией убедитесь, что в них нет секретной информации и что у вас есть право на публикацию. Мы можем скрыть или удалить материал, который нарушает эти условия или закон.',
      ],
    },
    {
      title: '6. Работа и изменение сервиса',
      paragraphs: [
        'Мы стараемся поддерживать Remora доступной и сохранять данные, но не обещаем непрерывную работу без ошибок. Функции могут меняться, временно отключаться или прекращаться. О существенных изменениях мы постараемся сообщить заранее, когда это возможно.',
        'Сохраняйте копии особенно важных материалов. Доступные средства экспорта могут зависеть от текущих возможностей сервиса.',
      ],
    },
    {
      title: '7. Ограничение доступа',
      paragraphs: [
        'Мы можем временно ограничить или прекратить доступ при нарушении этих условий, угрозе безопасности, требовании закона или длительном прекращении работы сервиса. По возможности мы сообщим причину и дадим время забрать данные, если это не создаёт новый риск и не запрещено законом.',
      ],
    },
    {
      title: '8. Ответственность',
      paragraphs: [
        'Каждая сторона отвечает в пределах, установленных применимым законодательством. Remora не отвечает за содержание пользовательских материалов, решения, принятые на их основе, и сбои внешних сервисов, которыми мы не управляем.',
      ],
    },
    {
      title: '9. Конфиденциальность',
      paragraphs: [
        'Правила обработки персональных данных описаны в Политике конфиденциальности. Она является частью этих условий.',
      ],
    },
    {
      title: '10. Изменения и связь',
      paragraphs: [
        'Мы можем обновлять условия при изменении сервиса или закона. Новая версия действует с момента публикации, если на странице не указано иное. К отношениям сторон применяется законодательство Российской Федерации.',
        'Если у вас есть вопрос, претензия или сообщение о нарушении, напишите нам.',
      ],
      contact: true,
    },
  ],
};

const termsEn: LegalDocument = {
  title: 'Terms of Use',
  description: 'The basic rules for using the Remora website and applications.',
  eyebrow: 'Service rules',
  updated: 'Updated October 2, 2026',
  intro:
    'These terms govern your use of remora.com.ru and related Remora applications. By creating an account or continuing to use the service, you agree to them.',
  sections: [
    {
      title: '1. About the service',
      paragraphs: [
        'Remora helps you create and study flashcards, courses, and other learning materials. It provides tools for independent learning but does not guarantee a specific learning outcome or replace professional advice.',
      ],
    },
    {
      title: '2. Your account',
      paragraphs: [
        'Keep your information current and protect access to your account. You are responsible for activity through your account until you notify us of unauthorized access.',
        'A Google Account may be linked to an existing Remora account with the same verified email address. When a secure match cannot be established, Remora may require additional confirmation.',
        'Users under 14 may use the service only with the consent of a parent or legal guardian.',
      ],
    },
    {
      title: '3. Your content',
      paragraphs: [
        'You retain the rights to materials you add to Remora. You grant us a limited right to store, process, transform, and display them only as needed to provide the features and sharing settings you select.',
        'You are responsible for the legality of your materials and for having the rights needed to use them. Do not publish another person’s personal data without a lawful basis.',
      ],
    },
    {
      title: '4. Prohibited use',
      bullets: [
        'violating the law, copyright, privacy, or other rights;',
        'uploading malicious code or dangerous or knowingly unlawful material;',
        'disrupting the service, bypassing restrictions, or obtaining unauthorized access or data;',
        'using automation for spam, overload, or abuse of the service;',
        'impersonating another person or misleading users.',
      ],
    },
    {
      title: '5. Public materials',
      paragraphs: [
        'Materials shared publicly may be visible to other users and search engines. Before publishing, make sure they contain no confidential information and that you have the right to publish them. We may hide or remove material that violates these terms or the law.',
      ],
    },
    {
      title: '6. Availability and changes',
      paragraphs: [
        'We work to keep Remora available and preserve data, but we do not promise uninterrupted or error-free operation. Features may change, be suspended, or be discontinued. We will try to provide advance notice of material changes where reasonably possible.',
        'Keep copies of especially important materials. Available export options may depend on the service’s current capabilities.',
      ],
    },
    {
      title: '7. Restricting access',
      paragraphs: [
        'We may temporarily restrict or terminate access for a violation of these terms, a security risk, a legal requirement, or permanent discontinuation of the service. Where possible, we will explain the reason and allow time to retrieve data unless doing so creates another risk or is prohibited by law.',
      ],
    },
    {
      title: '8. Liability',
      paragraphs: [
        'Each party is responsible to the extent required by applicable law. Remora is not responsible for user content, decisions made based on it, or failures of third-party services outside our control.',
      ],
    },
    {
      title: '9. Privacy',
      paragraphs: [
        'Our Privacy Policy explains how we process personal data and forms part of these terms.',
      ],
    },
    {
      title: '10. Changes and contact',
      paragraphs: [
        'We may update these terms when the service or the law changes. A new version takes effect when published unless the page states otherwise. The relationship between the parties is governed by the laws of the Russian Federation.',
        'Contact us with a question, complaint, or report of a violation.',
      ],
      contact: true,
    },
  ],
};

export function getLegalDocument(kind: LegalDocumentKind, language: LegalLanguage): LegalDocument {
  if (kind === 'privacy') return language === 'ru' ? privacyRu : privacyEn;
  return language === 'ru' ? termsRu : termsEn;
}
