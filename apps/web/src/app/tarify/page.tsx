import { PublicAnalytics } from '../../components/analytics/PublicAnalytics';
import type { Metadata } from 'next';
import { JsonLd } from '../../components/JsonLd';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { readLandingChrome } from '../../components/landing/readLandingChrome';
import { HomeTheme } from '../../components/home/HomeTheme';
import Image from 'next/image';
import { PricingMotion } from '../../components/pricing/PricingMotion';
import { PricingPlans } from '../../components/pricing/PricingPlans';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../lib/seo';
import { publicPlans } from '../../lib/pricing';
import '../home.css';
import './pricing.css';
import './pricing-motion.css';
import '../../components/landing/chrome.css';

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
  ['Закрытые материалы', '—', 'Да', 'Да'],
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
  const { header, footer } = readLandingChrome();
  return (
    <PricingMotion>
      <PublicAnalytics path="/tarify" />
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
      <LandingHeader html={header} />
      <main id="main-content" className="home pricing-page">
        <header className="pricing-hero">
          <div className="home-shell">
            <h1>
              Выучить своё <em>можно бесплатно</em>
            </h1>
            <p>
              Тарифы отличаются объёмом, автоматизацией и ИИ. <br />
              Занятия и повторения бесплатны на каждом тарифе.
            </p>
            <Image src="/lecture-demo/faq-pen.webp" alt="" width={165} height={165} unoptimized />
          </div>
        </header>
        <div className="home-shell">
          <PricingPlans />
        </div>

        <section className="pricing-guarantee home-shell" aria-labelledby="guarantee-title">
          <h2 id="guarantee-title">
            Оплата заканчивается.
            <br />
            <em>Знания остаются.</em>
          </h2>
          <p>
            Все режимы и повторения доступны бесплатно. После окончания тарифа вы сохраните доступ к
            созданным и сохранённым материалам и сможете экспортировать свои данные. На Free тоже
            нет рекламы.
          </p>
        </section>

        <section className="pricing-compare home-shell" aria-labelledby="compare-title">
          <h2 id="compare-title">Сравнение тарифов</h2>
          <p className="pricing-table-hint">Прокрутите таблицу вправо, чтобы увидеть все тарифы.</p>
          <div
            className="pricing-table-scroll"
            role="region"
            tabIndex={0}
            aria-labelledby="compare-title"
          >
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
                      <td key={`${feature}-${index}`}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pricing-faq home-shell" aria-labelledby="pricing-faq-title">
          <h2 id="pricing-faq-title">Вопросы об оплате</h2>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <div className="pricing-theme home-shell">
          <HomeTheme />
        </div>
      </main>
      <div className="landing-chrome" dangerouslySetInnerHTML={{ __html: footer }} />
    </PricingMotion>
  );
}
