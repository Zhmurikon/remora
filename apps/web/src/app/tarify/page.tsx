import type { Metadata } from 'next';
import { FishMark } from '@remora/ui';
import { JsonLd } from '../../components/JsonLd';
import { PublicAuthLink } from '../../components/auth/PublicSession';
import { HomeNav } from '../../components/home/HomeNav';
import { HomeTheme } from '../../components/home/HomeTheme';
import { CheckIcon } from '../../components/pricing/CheckIcon';
import { PricingPlans } from '../../components/pricing/PricingPlans';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../lib/seo';
import { publicPlans } from '../../lib/pricing';
import '../home.css';
import './pricing.css';

const title = 'Тарифы Free, Plus и Pro';
const description =
  'Сравните тарифы Запоминальни. Обучение, повторения и доступ к созданным материалам бесплатны; Plus и Pro добавляют объём, автоматизацию и ИИ.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/tarify' },
  openGraph: {
    type: 'website',
    title: `${title} — Запоминальня`,
    description,
    url: '/tarify',
    locale: 'ru_RU',
    siteName: 'Запоминальня',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Тарифы Запоминальни',
      },
    ],
  },
  twitter: { card: 'summary_large_image', title, description, images: [DEFAULT_OG_IMAGE] },
};

const comparison = [
  ['Курсы и наборы', '10 / 20', 'Без лимита', 'Без лимита'],
  ['MCP-записи в неделю', '500', 'Без лимита', 'Без лимита'],
  ['ИИ-расшифровка в неделю', '—', '300 минут', '1 500 минут'],
  ['ИИ-генерация в неделю', '—', '500 000 токенов', '2,5 млн токенов'],
  ['Обучение и повторения', 'Без лимита', 'Без лимита', 'Без лимита'],
] as const;

const faqs = [
  [
    'Будет ли автопродление?',
    'Нет. Сейчас это разовая оплата за месяц или год. После окончания периода деньги не списываются автоматически.',
  ],
  [
    'Что произойдёт после окончания тарифа?',
    'Материалы, классы, задания и обучение останутся доступны. Ограничится создание нового сверх лимитов Free и платные удобства.',
  ],
  [
    'Можно ли сменить период оплаты?',
    'Да, новый период выбирается при следующей разовой оплате. Активный период не сокращается.',
  ],
  ['Где применить промокод?', 'Промокод вводится в приложении перед переходом к оплате.'],
] as const;

export default function PricingPage() {
  return (
    <div className="home pricing-page">
      <a className="home-skip" href="#main-content">
        Перейти к содержимому
      </a>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'OfferCatalog',
          name: 'Тарифы Запоминальни',
          url: absoluteUrl('/tarify'),
          itemListElement: publicPlans.map((plan) => ({
            '@type': 'Offer',
            name: plan.name,
            priceCurrency: 'RUB',
            price: plan.monthPrice,
            url: absoluteUrl('/tarify'),
          })),
        }}
      />
      <div className="home-shell home-nav-shell">
        <HomeNav />
      </div>

      <main id="main-content">
        <header className="pricing-hero home-shell">
          <h1>
            Выучить своё можно <span>бесплатно</span>
          </h1>
          <p>
            Тарифы отличаются объёмом, автоматизацией и ИИ. Повторения, режимы обучения и доступ к
            уже созданным материалам не заканчиваются вместе с оплатой.
          </p>
          <PricingPlans />
        </header>

        <section className="pricing-guarantee home-shell" aria-labelledby="guarantee-title">
          <div>
            <h2 id="guarantee-title">
              Оплата заканчивается.
              <br />
              Знания остаются.
            </h2>
            <p>Это не сноска под тарифами, а главный контракт продукта.</p>
          </div>
          <ul>
            {[
              'Все режимы обучения и число повторений — без лимита',
              'Созданные и сохранённые материалы остаются доступны',
              'Свои данные можно экспортировать на любом тарифе',
              'Рекламы нет даже на Free',
            ].map((item) => (
              <li key={item}>
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pricing-compare home-shell" aria-labelledby="compare-title">
          <div className="pricing-section-head">
            <h2 id="compare-title">Сравните то, что действительно меняется</h2>
            <p>
              Здесь собраны решающие границы тарифов. Обучение вынесено отдельной строкой, чтобы
              бесплатный доступ не терялся среди квот.
            </p>
          </div>
          <div className="pricing-table-scroll" tabIndex={0} aria-label="Прокручиваемая таблица">
            <table>
              <thead>
                <tr>
                  <th scope="col">Возможность</th>
                  <th scope="col">Free</th>
                  <th scope="col">Plus</th>
                  <th scope="col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(([feature, free, plus, pro]) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    {[free, plus, pro].map((value, index) => (
                      <td
                        key={`${feature}-${index}`}
                        className={value === 'Без лимита' ? 'is-unlimited' : undefined}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pricing-faq home-shell" aria-labelledby="pricing-faq-title">
          <div>
            <h2 id="pricing-faq-title">Вопросы об оплате</h2>
            <p>Критические условия отвечаем здесь, а не прячем в процессе оформления.</p>
          </div>
          <div>
            {faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-footer home-shell">
        <a className="home-brand" href="/" aria-label="Запоминальня, главная">
          <FishMark />
          Запоминальня
        </a>
        <span>Учиться в своём темпе.</span>
        <HomeTheme />
        <nav aria-label="Навигация в подвале">
          <a href="/kursy">Каталог</a>
          <a href="/blog">Блог</a>
          <a href="/podborki">Подборки</a>
          <a href="/tarify">Тарифы</a>
          <a href="/#questions">Вопросы и ответы</a>
          <a href="/privacy">Конфиденциальность</a>
          <a href="/terms">Условия использования</a>
          <PublicAuthLink />
        </nav>
      </footer>
    </div>
  );
}
