/* global URLSearchParams, location, document */
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
const rows = [
  {
    title: '9Б — география',
    description:
      'Страны, столицы и природные зоны. Готовимся к контрольным и повторяем материал уроков.',
    role: 'Преподаватель',
  },
  {
    title: 'Биология: подготовка к ОГЭ — человек и его здоровье',
    description: 'Разбираем строение организма и закрепляем термины.',
    role: 'Ассистент',
  },
  {
    title: 'Английский язык — разговорная практика, уровень B1',
    description: 'Лексика для путешествий, работы и повседневного общения.',
    role: 'Преподаватель',
  },
  {
    title: 'История России: XIX век',
    description: 'Повторяем события, даты и исторических деятелей.',
    role: 'Ученик',
  },
];
const btn = (s, secondary = false) =>
  `<button class="btn ${secondary ? 'secondary' : ''}">${s}</button>`;
const row = (r) =>
  `<a class="class-row" href="#"><div class="row-body"><h3>${r.title}</h3><p>${r.description}</p><span class="role">${r.role}</span></div><span class="go">Открыть ${icon('arrow')}</span></a>`;
const archive = `<button class="archive">${icon('chevron')}${icon('archive')}Архив <span>1</span></button>`;
const tabs = `<div class="tabs"><button class="tab on">Преподаю <span class="count">4</span></button><button class="tab">Учусь <span class="count">1</span></button></div>`;
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
const lower = `<section class="lower"><div class="lower-title"><h2>Действия и состояния</h2><small>Отдельные фрагменты интерфейса · одинаковые правила во всех вариантах</small></div><div class="states"><section class="state"><h3>Новый класс</h3><label>Название</label><input class="input" value="9В — география" readonly>${btn('Создать класс')}<p style="margin-top:12px">После создания открывается класс: можно добавить набор и первое задание.</p><p class="small-label">Если достигнут лимит</p><p>Не удалось создать класс. Показываем причину ограничения рядом с кнопкой.</p></section><section class="state"><h3>Вступить в класс</h3><label>Код приглашения</label><input class="input" value="K7MP2X4R" readonly>${btn('Вступить')}<div class="notice"><strong>Заявка отправлена</strong>Класс появится после одобрения преподавателем.</div><p style="margin-top:9px">Без одобрения — сразу переход в класс.</p></section><section class="state"><h3>Когда список пуст</h3><div class="state-empty"><img src="${base}course-books.webp" alt=""><div><h3 class="empty-title">Учитесь вместе</h3><p>Создайте класс или вступите по коду преподавателя.</p></div></div><div class="retry"><strong>Не удалось загрузить классы</strong><p>Проверьте соединение.</p><button class="text-btn">Повторить ${icon('arrow')}</button></div><div class="skeleton"><i></i><i></i></div><div class="sample-label">Загрузка: строки вместо пустого экрана</div></section><section class="state"><h3>После открытия класса</h3><div class="state-links"><span><b>Преподаватель:</b> задания, отчёты, ученики и приглашения.</span><span><b>Ассистент:</b> задания, материалы и отчёты.</span><span><b>Ученик:</b> свои задания и материалы.</span></div><div class="access"><strong>Класс доступен для просмотра</strong><p>Материалы и прежние задания сохранены. Создание нового ограничено тарифом.</p></div></section></div></section>`;
const variants = {
  a: {
    name: 'А · Классы по ролям',
    desc: 'Две группы на одном экране',
    body: `<header class="page-head"><div><h1>Классы</h1><p>Ваши учебные группы — в одной подборке.</p></div></header><div class="section-head"><h2>Преподаю <span class="count">4</span></h2><button class="text-btn">${icon('plus')}Создать класс</button></div>${rows.slice(0, 3).map(row).join('')}${archive}<div class="section-head" style="margin-top:10px"><h2>Учусь <span class="count">1</span></h2><button class="text-btn">Вступить по коду ${icon('arrow')}</button></div>${row(rows[3])}`,
  },
  b: {
    name: 'Б · Навигатор классов',
    desc: 'Список слева, описание выбранного класса справа',
    body: `<header class="page-head"><div><h1>Классы</h1><p>Выберите класс, чтобы перейти к совместной работе.</p></div><div class="actions">${btn('Вступить по коду', true)}${btn(icon('plus') + 'Создать класс')}</div></header><div class="two-pane"><section class="index">${tabs}${rows
      .slice(0, 3)
      .map(
        (r, i) =>
          `<a href="#" class="nav-row ${i === 0 ? 'active' : ''}"><h3>${r.title}</h3><span class="role">${r.role}</span></a>`,
      )
      .join(
        '',
      )}${archive}<p class="muted" style="font-size:13px;padding:14px">Вкладка «Учусь» покажет классы ваших преподавателей.</p></section><section><div class="split-caption"><span>Выбранный класс</span><span>1 из 3 активных</span></div><article class="preview"><span class="role">Вы — преподаватель</span><h2>${rows[0].title}</h2><p>${rows[0].description}</p>${btn('Открыть класс ' + icon('arrow'))}<div class="preview-note"><h3>Внутри класса</h3><p>Материалы, задания и отчёт о прогрессе. Здесь же можно пригласить учеников.</p></div></article><p class="preview-foot">Полное название и описание можно прочитать до перехода к заданиям.</p></section></div>`,
  },
  c: {
    name: 'В · Простой список',
    desc: 'Широкие строки и переключение роли',
    body: `<header class="page-head"><div><h1>Классы</h1><p>Задания и материалы ваших учебных групп.</p></div><div class="actions">${btn('Вступить по коду', true)}${btn(icon('plus') + 'Создать класс')}</div></header>${tabs}<section class="list-panel">${rows.slice(0, 3).map(row).join('')}${archive}</section><div class="hint">${icon('info')}<span>Во вкладке «Преподаю» собраны классы, где вы преподаватель или ассистент. Классы ваших преподавателей — во вкладке «Учусь».</span></div>`,
  },
};
const variant = new URLSearchParams(location.search).get('variant') || 'a';
const v = variants[variant] || variants.a;
document.getElementById('board').innerHTML =
  `<div class="board-head"><strong>${v.name}</strong><small>${v.desc} · Учебные примеры</small></div><div class="screen preview-only">${rail}<main>${v.body}</main></div><div class="preview-only">${lower}</div>`;
