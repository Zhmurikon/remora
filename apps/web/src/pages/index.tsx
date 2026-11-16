import Head from 'next/head';
import { PublicAnalytics } from '../components/analytics/PublicAnalytics';
import { JsonLd } from '../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../lib/seo';

const title = 'Конспект и карточки по записи лекции | Запоминальня';
const description =
  'Загрузите запись лекции, соберите конспект и проверьте себя по карточкам перед зачётом. Попробуйте тренажёр без регистрации.';
const url = absoluteUrl('/');
const image = absoluteUrl(DEFAULT_OG_IMAGE);

export default function HomePage() {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="yandex-verification" content="77f83742d96aa582" key="yandex-1" />
        <meta name="yandex-verification" content="da6e853dcccb797a" key="yandex-2" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ru_RU" />
        <meta property="og:site_name" content="Запоминальня" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
      </Head>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'Organization', '@id': url + '#organization', name: 'Запоминальня', url },
            {
              '@type': 'WebSite',
              name: 'Запоминальня',
              url,
              inLanguage: 'ru',
              description,
              publisher: { '@id': url + '#organization' },
            },
          ],
        }}
      />
      <PublicAnalytics path="/" />
    </>
  );
}
