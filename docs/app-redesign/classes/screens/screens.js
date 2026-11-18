const I = {
  home: '<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3z"/>',
  materials: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M6 15h12M10 7h4"/>',
  note: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  practice: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m7 10 2 2-2 2m5 0h4"/>',
  classes: '<path d="M4 21V9h16v12M9 21v-6h6v6M8 9V5h8v4M10 5V3h4v2"/>',
  star: '<path d="m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  settings:
    '<path d="m10 3-1 3-3-1-2 3 2 3-2 2 2 4 3-1 1 3h4l1-3 3 1 2-4-2-2 2-3-2-3-3 1-1-3z"/><circle cx="12" cy="11" r="3"/>',
  moon: '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const base = '../../../../apps/web/public/lecture-demo/';
const rail = `<aside class="rail"><div class="brand"><img src="${base}remora-icon.png" alt="">Запоминальня</div><nav class="nav">${[
  ['home', 'Главная'],
  ['materials', 'Материалы'],
  ['note', 'Ai Конспекты'],
  ['practice', 'Практика'],
  ['classes', 'Классы'],
  ['star', 'Достижения'],
  ['card', 'Тариф'],
  ['settings', 'Настройки'],
]
  .map(([i, s]) => `<a href="#" class="${i === 'classes' ? 'selected' : ''}">${icon(i)}${s}</a>`)
  .join(
    '',
  )}</nav><div class="rail-bottom"><div class="person"><span class="avatar">А</span><div><strong>Александр</strong><br><small>preview@example.test</small></div></div><div class="theme">${icon('moon')}Тема: системная</div><div class="logout">Выйти</div></div></aside>`;
const button = (label, secondary = false) =>
  `<button class="btn ${secondary ? 'secondary' : ''}" type="button">${label}</button>`;
const back = (label = 'Все классы') => `<a class="back" href="#">${icon('arrow')} ${label}</a>`;
const badge = (status) =>
  `<span class="status ${status}">${{ done: 'Выполнено', work: 'В работе', late: 'Просрочено', idle: 'Не начато' }[status]}</span>`;
const meter = (value, goal, status = 'work') =>
  `<div class="meter ${status}"><i style="width:${Math.min(100, (value / goal) * 100)}%"></i></div>`;
const heading = (role, actions = '') =>
  `${back()}<header class="page-head"><div><h1>9Б — география</h1><div class="role">${role}</div><p>Страны, столицы и природные зоны.<br>Готовимся к контрольным и повторяем материал уроков.</p></div><div class="actions">${actions}</div></header>`;
const sets = [
  ['Страны и столицы Европы', '32 карточки'],
  ['Природные зоны России', '24 карточки'],
  ['Реки и озёра', '20 карточек'],
];
const materials = () =>
  sets
    .map(
      ([title, n]) =>
        `<a href="#" class="material"><span class="book-icon">${icon('materials')}</span><span><strong>${title}</strong><small>${n}</small></span>${icon('arrow')}</a>`,
    )
    .join('');
const state = (title, content) => `<section class="state"><h3>${title}</h3>${content}</section>`;
const note = (text) => `<p>${text}</p>`;
const students = [
  [
    'Анна Смирнова',
    'anna_smirnova',
    [
      ['work', 56, 80],
      ['done', 24, 24],
      ['idle', 0, 80],
    ],
  ],
  [
    'Михаил Волков',
    'm_volkov',
    [
      ['done', 86, 80],
      ['work', 16, 24],
      ['work', 60, 80],
    ],
  ],
  [
    'Софья Морозова',
    'sofia_m',
    [
      ['work', 42, 80],
      ['late', 12, 24],
      ['idle', 0, 80],
    ],
  ],
  [
    'Илья Кузнецов',
    'ilya_k',
    [
      ['idle', 0, 80],
      ['done', 24, 24],
      ['work', 40, 80],
    ],
  ],
];
const assignmentForm = `<section class="assignment-form"><h2>Новое задание</h2><p class="intro">Выберите материал и цель для учеников.</p><div class="form-grid"><label class="wide">Название<input value="Повторяем страны Европы" readonly></label><label class="wide">Набор<select><option>Страны и столицы Европы · 32 карточки</option></select></label><label>Цель<select><option>Освоение, %</option><option>Пройдено карточек</option><option>Результат теста, %</option></select></label><label>Значение<input value="80" readonly></label><label class="wide">Срок <span class="muted">· необязательно</span><input value="20.11.2026, 18:00" readonly></label></div>${button('Опубликовать задание')}</section>`;
const teacher = `${heading('Вы — преподаватель', button('Скопировать приглашение', true))}<section class="pending"><div><h3>Заявка на вступление</h3><p>Алексей Орлов <span class="muted">· @alex_orlov</span></p></div>${button('Принять', true)}</section><section class="progress"><div class="section-head"><h2>Прогресс класса <span class="count">4 ученика</span></h2><button class="text-btn">Скачать XLSX ${icon('arrow')}</button></div><div class="table-scroll"><table><thead><tr><th>Ученик</th><th>Страны Европы<small>Освоить на 80%</small></th><th>Природные зоны<small>Пройти 24 карточки</small></th><th>Реки и озёра<small>Набрать 80% в тесте</small></th></tr></thead><tbody>${students.map(([name, handle, cells]) => `<tr><td><a class="student-link" href="#">${name} ${icon('chevron')}</a><small>@${handle}</small></td>${cells.map(([s, n, g]) => `<td>${badge(s)}<span class="cell-value">${n} из ${g}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="helper">Нажмите на имя ученика, чтобы открыть подробный отчёт.</p></section><div class="teacher-lower">${assignmentForm}<div class="resources"><section><h2>Материалы класса <span class="count">3 набора</span></h2><div class="set-list">${materials()}</div><label class="add-label">Добавить мой набор</label><div class="add-material"><select><option>Климат и погода · 18 карточек</option></select>${button('Добавить', true)}</div></section><section class="errors"><h2>Где чаще ошибаются</h2><p class="intro">Общая статистика класса, без ответов отдельных учеников.</p><div class="error-row"><div><strong>Столица Швейцарии</strong><p>Берн · Страны и столицы Европы</p></div><div class="error-number">8 ошибок<small>40% ответов</small></div></div><div class="error-row"><div><strong>Лесотундра</strong><p>Переходная зона между тундрой и тайгой</p></div><div class="error-number">5 ошибок<small>25% ответов</small></div></div></section></div></div>`;
const assignment = ({ title, set, goal, value, target, status, due, open }) =>
  `<article class="assignment"><div class="assignment-top"><div><h3>${title}</h3><p>${set}</p></div>${badge(status)}</div><div class="assignment-info"><span>${goal}</span><span>${due}</span></div>${meter(value, target, status)}<div class="assignment-bottom"><span class="muted">${value} из ${target}</span>${open ? `<span class="muted">Откроется ${open}</span>` : button('Продолжить ' + icon('arrow'), status === 'done')}</div></article>`;
const studentAssignments = [
  {
    title: 'Страны Европы',
    set: 'Страны и столицы Европы',
    goal: 'Освоить на 80%',
    value: 56,
    target: 80,
    status: 'work',
    due: 'До 20 ноября, 18:00',
  },
  {
    title: 'Реки и озёра',
    set: 'Реки и озёра',
    goal: 'Набрать 80% в тесте',
    value: 0,
    target: 80,
    status: 'idle',
    due: 'До 23 ноября, 18:00',
  },
  {
    title: 'Природные зоны',
    set: 'Природные зоны России',
    goal: 'Пройти 24 карточки',
    value: 24,
    target: 24,
    status: 'done',
    due: 'Без дедлайна',
  },
];
const student = `${heading('Вы — ученик')}<div class="student-layout"><section><div class="section-head"><h2>Мои задания <span class="count">3</span></h2></div><p class="intro">Ближайшие сроки — в начале списка.</p>${studentAssignments.map(assignment).join('')}</section><aside class="student-materials"><h2>Материалы класса</h2><p class="intro">Открывайте наборы и повторяйте материал в своём темпе.</p><div class="set-list">${materials()}</div></aside></div>`;
const report = `${back('К отчёту класса')}<header class="page-head"><div><h1>Анна Смирнова</h1><p>@anna_smirnova · 9Б — география</p></div></header><section class="report-summary"><div><h2>Задания</h2><p>Выполнено 1 из 3</p></div><div class="completion"><span class="complete"></span><span></span><span></span></div></section><div class="report-list">${studentAssignments.map((a, i) => `<article class="report-row"><div class="report-title"><h3>${a.title}</h3>${badge(a.status)}</div><p>${a.set} · ${a.goal}</p><div class="report-progress">${meter(a.value, a.target, a.status)}<strong>${a.value} из ${a.target}</strong></div><small>${i === 1 ? 'Ещё не приступала' : `Последняя активность: ${i === 0 ? '18' : '17'} ноября, ${i === 0 ? '14:32' : '16:10'}`}</small></article>`).join('')}</div><div class="report-foot">${icon('info')}<p>Прогресс по заданиям и время последней активности.<br>Ответы на отдельные карточки в этот отчёт не входят.</p></div>`;
const invite = `${back()}<div class="invite-layout"><section class="invitation"><span class="invite-icon">${icon('classes')}</span><h1>Присоединиться<br>к классу</h1><p class="invite-intro">Приглашение от преподавателя откроет<br>доступ к заданиям и материалам класса.</p><div class="invite-code"><span>Код приглашения</span><strong>K7MP2X4R</strong></div>${button('Вступить в класс ' + icon('arrow'))}<p class="invite-help">Если в классе включено одобрение,<br>преподаватель сначала примет вашу заявку.</p></section><aside class="invite-note"><h2>Учиться вместе</h2><p>Выполняйте задания, следите за сроками и возвращайтесь к материалам для повторения.</p><div class="note-rule"></div><p>Класс появится в разделе<br><strong>«Классы» → «Учусь».</strong></p></aside></div>`;
const views = {
  teacher: {
    name: 'Класс преподавателя',
    caption: 'Журнал прогресса и работа с классом',
    body: teacher,
    states: [
      state(
        'Роль ассистента',
        note('Та же композиция: задания, материалы и отчёты. Приглашение и приём заявок скрыты.'),
      ),
      state(
        'Только просмотр',
        `<div class="notice">Класс доступен для просмотра</div>${note('Материалы, ученики и прежние задания сохранены. Новые действия скрыты по правам.')}`,
      ),
      state(
        'Первое задание',
        note(
          'Добавьте набор, чтобы создать первое задание. Вместо пустой таблицы — короткая подсказка.',
        ),
      ),
      state(
        'Ошибка и загрузка',
        note('При загрузке — скелет строк. При сбое — сообщение и «Повторить» в нужном разделе.'),
      ),
    ],
  },
  student: {
    name: 'Класс ученика',
    caption: 'Задания по срокам и материалы под рукой',
    body: student,
    states: [
      state(
        'Заданий пока нет',
        note('Преподаватель ещё не опубликовал задания для класса. Материалы остаются доступны.'),
      ),
      state(
        'Срок прошёл',
        `${badge('late')}${note('Продолжить выполнение можно и после дедлайна. Обучение остаётся доступным.')}`,
      ),
      state(
        'Откроется позже',
        `<div class="notice">Откроется 21 ноября, 09:00</div>${note('До начала задания дата заменяет кнопку «Продолжить».')}`,
      ),
      state(
        'Не удалось загрузить',
        note('Проверьте соединение и попробуйте ещё раз.') +
          `<button class="text-btn">Повторить ${icon('arrow')}</button>`,
      ),
    ],
  },
  report: {
    name: 'Отчёт по ученику',
    caption: 'Личный прогресс без лишних показателей',
    body: report,
    states: [
      state(
        'Ещё не приступил',
        `${badge('idle')}${note('Нулевой прогресс и подпись «Ещё не приступил» вместо выдуманной активности.')}`,
      ),
      state(
        'Заданий пока нет',
        note('В классе ещё нет заданий. После публикации здесь появится прогресс ученика.'),
      ),
      state(
        'Доступ к отчёту',
        note(
          'Экран доступен преподавателю и ассистенту этого класса. Ошибка доступа не показывает данные ученика.',
        ),
      ),
      state(
        'Ошибка и загрузка',
        note(
          'При загрузке — скелет строк. При сбое — «Не удалось загрузить отчёт» и кнопка повтора.',
        ),
      ),
    ],
  },
  invitation: {
    name: 'Приглашение в класс',
    caption: 'Одно действие и понятный результат',
    body: invite,
    states: [
      state(
        'Нужен ответ преподавателя',
        `<div class="notice"><strong>Заявка отправлена</strong>Класс появится после одобрения.</div>${note('Повторная отправка недоступна.')}`,
      ),
      state(
        'Без одобрения',
        note(
          'После успешного вступления сразу открывается класс ученика с заданиями и материалами.',
        ),
      ),
      state(
        'Некорректная ссылка',
        note(
          'В ссылке нет корректного кода. Попросите преподавателя прислать приглашение ещё раз.',
        ),
      ),
      state(
        'Не удалось вступить',
        note('Показываем причину рядом с кнопкой. При сетевом сбое можно повторить попытку.'),
      ),
    ],
  },
};
const key = new URLSearchParams(location.search).get('screen') || 'teacher';
const v = views[key] || views.teacher;
document.getElementById('board').innerHTML =
  `<div class="board-head"><strong>${v.name}</strong><small>${v.caption} · Учебные примеры</small></div><div class="screen ${key}">${key === 'student' ? rail.replace('Александр', 'Анна') : rail}<main>${v.body}</main></div><footer class="states-board"><div class="states-heading"><h2>Состояния и права</h2><small>Фрагменты того же концепта</small></div><div class="states">${v.states.join('')}</div></footer>`;
