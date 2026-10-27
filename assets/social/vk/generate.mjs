import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = dirname(fileURLToPath(import.meta.url));
const markPath = join(outDir, '../../brand/mark/remora-mark.svg');
const compactMarkPath = join(outDir, '../../brand/mark/remora-mark-compact.svg');
const asDataUri = (path) => `data:image/svg+xml;base64,${readFileSync(path).toString('base64')}`;
const mark = asDataUri(markPath);
const compactMark = asDataUri(compactMarkPath);

const palette = {
  bg: '#FCFBF8',
  surface: '#FFFFFF',
  ink: '#132A3D',
  muted: '#4E606F',
  border: '#DDE5E6',
  teal: '#0D8285',
  tealDark: '#0A696C',
  tealSoft: '#E0F4F4',
  orange: '#EA8D2F',
  orangeSoft: '#FCEFE4',
  mint: '#EBF6EF',
  lavender: '#F1EEFA',
};

const font = `'Noto Sans', 'DejaVu Sans', sans-serif`;

function shell(width, height, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <rect width="${width}" height="${height}" fill="${palette.bg}"/>
  ${body}
</svg>\n`;
}

const cover = shell(1920, 768, `
  <path d="M0 0h430l150 768H0z" fill="${palette.tealSoft}"/>
  <circle cx="1760" cy="56" r="250" fill="${palette.orangeSoft}"/>
  <g opacity=".78" transform="rotate(-7 186 486)">
    <rect x="-70" y="315" width="470" height="260" rx="38" fill="${palette.surface}" stroke="${palette.border}" stroke-width="5"/>
    <rect x="-16" y="373" width="260" height="24" rx="12" fill="${palette.tealSoft}"/>
    <rect x="-16" y="418" width="330" height="18" rx="9" fill="${palette.border}"/>
    <rect x="-16" y="454" width="285" height="18" rx="9" fill="${palette.border}"/>
    <rect x="-16" y="515" width="126" height="34" rx="17" fill="${palette.orangeSoft}"/>
  </g>
  <g transform="translate(520 138)">
    <text x="0" y="34" font-family="${font}" font-size="34" font-weight="700" letter-spacing="1.4" fill="${palette.teal}">ЗАПОМИНАЛЬНЯ</text>
    <text x="0" y="166" font-family="${font}" font-size="76" font-weight="700" fill="${palette.ink}">Учитесь регулярно.</text>
    <text x="0" y="258" font-family="${font}" font-size="76" font-weight="700" fill="${palette.ink}">Помните дольше.</text>
    <text x="2" y="330" font-family="${font}" font-size="31" font-weight="400" fill="${palette.muted}">Карточки, курсы и повторение в одном месте</text>
    <g transform="translate(0 382)">
      <rect width="170" height="58" rx="29" fill="${palette.tealSoft}"/>
      <text x="85" y="38" text-anchor="middle" font-family="${font}" font-size="22" font-weight="600" fill="${palette.tealDark}">Карточки</text>
      <rect x="186" width="130" height="58" rx="29" fill="${palette.mint}"/>
      <text x="251" y="38" text-anchor="middle" font-family="${font}" font-size="22" font-weight="600" fill="${palette.ink}">Курсы</text>
      <rect x="332" width="190" height="58" rx="29" fill="${palette.orangeSoft}"/>
      <text x="427" y="38" text-anchor="middle" font-family="${font}" font-size="22" font-weight="600" fill="#9C5718">Повторение</text>
    </g>
  </g>
  <g transform="translate(1300 100)">
    <circle cx="250" cy="282" r="248" fill="${palette.surface}" stroke="${palette.border}" stroke-width="5"/>
    <image href="${mark}" x="30" y="60" width="440" height="440" preserveAspectRatio="xMidYMid meet"/>
  </g>
`, 'Обложка сообщества Запоминальни');

const avatar = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="Круглый аватар сообщества Запоминальни">
  <circle cx="400" cy="400" r="392" fill="${palette.tealSoft}"/>
  <circle cx="400" cy="400" r="354" fill="${palette.surface}"/>
  <circle cx="400" cy="400" r="330" fill="${palette.tealSoft}"/>
  <image href="${compactMark}" x="124" y="124" width="552" height="552" preserveAspectRatio="xMidYMid meet"/>
  <circle cx="400" cy="400" r="388" fill="none" stroke="${palette.surface}" stroke-width="16"/>
</svg>\n`;

const icons = {
  start: `<circle cx="116" cy="112" r="58" fill="${palette.teal}"/><path d="M102 80l52 32-52 32z" fill="#fff"/>`,
  how: `<rect x="58" y="58" width="116" height="42" rx="16" fill="${palette.tealSoft}" stroke="${palette.teal}" stroke-width="5"/><rect x="78" y="118" width="116" height="42" rx="16" fill="${palette.mint}" stroke="${palette.teal}" stroke-width="5"/><rect x="98" y="178" width="116" height="42" rx="16" fill="${palette.orangeSoft}" stroke="${palette.orange}" stroke-width="5"/>`,
  materials: `<path d="M52 68c44-10 82 2 112 28v126c-31-26-68-36-112-26z" fill="${palette.tealSoft}" stroke="${palette.teal}" stroke-width="5"/><path d="M276 68c-44-10-82 2-112 28v126c31-26 68-36 112-26z" fill="${palette.orangeSoft}" stroke="${palette.orange}" stroke-width="5"/><path d="M164 96v126" stroke="${palette.ink}" stroke-width="5"/>`,
  news: `<path d="M62 130h54l94-52v132l-94-52H62z" fill="${palette.tealSoft}" stroke="${palette.teal}" stroke-width="6" stroke-linejoin="round"/><path d="M116 158l18 66H86l-14-66" fill="${palette.orangeSoft}" stroke="${palette.orange}" stroke-width="6" stroke-linejoin="round"/><path d="M234 103l34-22M240 143h42M234 183l34 22" stroke="${palette.orange}" stroke-width="8" stroke-linecap="round"/>`,
};

function menuTile(key, title, number, accent) {
  return shell(752, 512, `
    <rect x="22" y="22" width="708" height="468" rx="44" fill="${palette.surface}" stroke="${palette.border}" stroke-width="4"/>
    <rect x="50" y="50" width="118" height="44" rx="22" fill="${accent}"/>
    <text x="109" y="80" text-anchor="middle" font-family="${font}" font-size="20" font-weight="700" fill="${palette.ink}">${number}</text>
    <g transform="translate(60 104)">${icons[key]}</g>
    <text x="54" y="420" font-family="${font}" font-size="48" font-weight="700" fill="${palette.ink}">${title}</text>
    <circle cx="677" cy="419" r="27" fill="${palette.teal}"/>
    <path d="M665 419h24m-10-10l10 10-10 10" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  `, `Пункт меню: ${title}`);
}

const pinned = shell(1080, 1350, `
  <rect x="0" y="0" width="1080" height="30" fill="${palette.teal}"/>
  <circle cx="935" cy="120" r="190" fill="${palette.orangeSoft}"/>
  <text x="82" y="126" font-family="${font}" font-size="30" font-weight="700" letter-spacing="1.2" fill="${palette.teal}">ЗАПОМИНАЛЬНЯ</text>
  <text x="78" y="248" font-family="${font}" font-size="70" font-weight="700" fill="${palette.ink}">Место для знаний,</text>
  <text x="78" y="332" font-family="${font}" font-size="64" font-weight="700" fill="${palette.ink}">к которым возвращаются</text>
  <text x="82" y="405" font-family="${font}" font-size="30" fill="${palette.muted}">Создавайте материалы и повторяйте их в удобном режиме.</text>
  <g transform="translate(76 485)">
    <rect width="928" height="174" rx="30" fill="${palette.surface}" stroke="${palette.border}" stroke-width="4"/>
    <circle cx="78" cy="87" r="42" fill="${palette.tealSoft}"/><text x="78" y="101" text-anchor="middle" font-family="${font}" font-size="38" font-weight="700" fill="${palette.teal}">1</text>
    <text x="148" y="78" font-family="${font}" font-size="34" font-weight="700" fill="${palette.ink}">Добавьте карточки</text>
    <text x="148" y="122" font-family="${font}" font-size="25" fill="${palette.muted}">Вручную или импортом из готового файла</text>
  </g>
  <g transform="translate(76 683)">
    <rect width="928" height="174" rx="30" fill="${palette.surface}" stroke="${palette.border}" stroke-width="4"/>
    <circle cx="78" cy="87" r="42" fill="${palette.mint}"/><text x="78" y="101" text-anchor="middle" font-family="${font}" font-size="38" font-weight="700" fill="${palette.teal}">2</text>
    <text x="148" y="78" font-family="${font}" font-size="34" font-weight="700" fill="${palette.ink}">Выберите режим</text>
    <text x="148" y="122" font-family="${font}" font-size="25" fill="${palette.muted}">Карточки, тест, ввод ответа и заучивание</text>
  </g>
  <g transform="translate(76 881)">
    <rect width="928" height="174" rx="30" fill="${palette.surface}" stroke="${palette.border}" stroke-width="4"/>
    <circle cx="78" cy="87" r="42" fill="${palette.orangeSoft}"/><text x="78" y="101" text-anchor="middle" font-family="${font}" font-size="38" font-weight="700" fill="${palette.orange}">3</text>
    <text x="148" y="78" font-family="${font}" font-size="34" font-weight="700" fill="${palette.ink}">Возвращайтесь к сложному</text>
    <text x="148" y="122" font-family="${font}" font-size="25" fill="${palette.muted}">Расписание повторений учитывает ваши ответы</text>
  </g>
  <rect x="76" y="1110" width="640" height="96" rx="48" fill="${palette.teal}"/>
  <text x="396" y="1170" text-anchor="middle" font-family="${font}" font-size="25" font-weight="700" fill="#fff">Начните с одного небольшого набора</text>
  <rect x="770" y="1068" width="238" height="238" rx="34" fill="${palette.surface}"/>
  <image href="${compactMark}" x="779" y="1077" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>
`, 'Обложка закреплённой записи Запоминальни');

const assets = {
  'cover': cover,
  'avatar': avatar,
  'menu-start': menuTile('start', 'Начать учиться', '01', palette.tealSoft),
  'menu-how': menuTile('how', 'Как это работает', '02', palette.mint),
  'menu-materials': menuTile('materials', 'Полезные материалы', '03', palette.orangeSoft),
  'menu-news': menuTile('news', 'Новости сервиса', '04', palette.lavender),
  'pinned-post': pinned,
};

mkdirSync(outDir, { recursive: true });
for (const [name, svg] of Object.entries(assets)) {
  const svgPath = join(outDir, `${name}.svg`);
  const pngPath = join(outDir, `${name}.png`);
  writeFileSync(svgPath, svg);
  execFileSync('convert', ['-background', 'none', svgPath, pngPath]);
}
