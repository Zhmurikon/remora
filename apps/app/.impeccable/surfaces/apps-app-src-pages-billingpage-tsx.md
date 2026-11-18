---
version: 1
slug: 'apps-app-src-pages-billingpage-tsx'
primary_target: 'apps/app/src/pages/BillingPage.tsx'
related_targets: ['apps/app/src/pages/billing.css']
---

# BillingPage

Mode: Operate. Продолжение существующего бумажного кабинета; пользователь выбрал В и одобрил демонстрацию движения. Серверные условия и платежи не меняются.

## Direction contract

THESIS: Пользователь видит свой действующий тариф и выбирает оплачиваемый период без неясных обещаний. Три самостоятельные карточки, без рекламного hero и давления на покупку.

OWN-WORLD: Белое поле, бумажные панели, синие чернила, тонкие границы, мягкие углы. Georgia у заголовка и тарифов, Inter/системный гротеск в управлении. Официальный синий знак текущего кабинета и существующие маленькие рисунки.

STORY: Проверить текущий доступ → выбрать месяц или год → при необходимости ввести промокод → перейти в существующую ЮKassa. История платежей и реферальная ссылка остаются рядом. Обучение сохраняется на любом тарифе.

FIRST VIEWPORT: Общий rail 232px; справа заголовок 44px, вводный абзац, панель текущего тарифа. Ниже период слева и раскрытие промокода справа. Три карточки Free/Plus/Pro с ценами 0/2499/9999 ₽ за год; основное синее действие у Plus. На узком экране карточки идут вертикально. Под ними история и приглашение друга. Подложка периода движется 180мс, рисунки откликаются на кнопку 220мс; reduced motion убирает перемещение.

FORM: Три карточки — #3 в исходном списке, seed 79e1939f, surface/operate. Dealt 7/6/3; сервис roll работал degraded, catalog QUALITY BAR boards не получены. Пользователь явно выбрал В (#3). Code-led; качество сверяется с docs/app-redesign/billing/concepts/c.png, согласованной motion/preview.html и действующими /app/materials и /app/sets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Extension boundary: глобальная design.md сохраняется, исторический teal drift не исправляется. Специфика готовой поверхности документируется в docs/app-redesign/billing/implementation.md. Все растры уже существовали в apps/web/public/lecture-demo; файлы бренда не меняются.
