# Подборки — вариант А

18 ноября 2026 года. Владелец выбрал [папку с материалами](concepts/a-folder.png).
Рабочая страница — `http://localhost:3000/podborki`.

Подборки расположены горизонтальными папками. Заголовок, описание и переход
остаются HTML-содержимым. Изображение имеет заданные пропорции и пустой alt,
поскольку повторяет учебную тему. На телефоне папка складывается в колонку.
Верхняя картотека и нижние карточки взяты из существующих иллюстраций главной.
Новый рисунок папки подготовлен отдельно по утверждённому эскизу.

Шапка использует существующий PublicHeader. В футере применён тот же синий знак.
Палитра списка опирается на lecture-токены обеих тем. Все эффекты движения
согласуются следующим этапом.

## Проверки

- 15 существующих тестов подборок прошли, включая публикацию, пустое состояние,
  права доступа, недоступные курсы, ошибки API, SEO и экранирование текста.
- TypeScript, ESLint изменённых компонентов и Prettier прошли.
- Production-сборка выполнена с `API_INTERNAL_URL=http://localhost:3000`.
  Первоначальный запуск с адресом по умолчанию завершился успешно, но сообщил
  о недоступном API на порту 8000. Для повторной сборки указан локальный шлюз.
- В браузере проверены ширины 320, 390, 768, 1440, 1920 и 3840 px.
  Горизонтального переполнения нет. Проверены светлая и тёмная темы,
  загрузка иллюстраций и реальные переходы к подборке и регистрации.
- При переходе в подборку локальный API вернул два доступных курса из трёх
  редакционных ссылок. Существующее описание подборки сохранено.

[Вёрстка на компьютере](review/desktop.png) · [Тёмная тема на телефоне](review/mobile-dark.png).
Скриншоты и исходный PNG хранятся локально, исключены из Git.

## Иллюстрация

Продуктовый файл — `apps/web/public/images/collections/study-folder.webp`,
1200 × 800, около 294 КиБ. Исходник — `concepts/study-folder-source.png`.
Использован встроенный imagegen с утверждённым эскизом в качестве референса,
прозрачный фон сохранён при экспорте в WebP.

Запрос к генератору

> Extract and faithfully recreate ONLY the large educational illustration inside the left half of the cream collection panel of this approved website mockup: open pale-yellow file folder containing cream study sheets with small probability formula, histogram and connected nodes, in front a spiral notebook with a sketched bell curve and blue pen. Fine blue ballpoint crosshatching, same angle, same delicate warm yellow accents and clear detailed outlines. Isolated reusable web illustration on fully transparent background, landscape aspect ratio, tightly framed with small safe margin. No website, no UI panel, no buttons, no headlines, no logo, no added lettering. Preserve the approved drawing's composition. Shadows only short delicate blue hatch marks immediately under the objects, transparency around every edge.
