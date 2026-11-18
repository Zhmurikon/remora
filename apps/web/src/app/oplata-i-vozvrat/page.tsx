import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal/LegalPage';
import { DEFAULT_OG_IMAGE } from '../../lib/seo';
import { PAYMENT_RETURN_PATH, paymentReturnDocument } from '../../lib/payment-return';

const { title, description } = paymentReturnDocument;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: PAYMENT_RETURN_PATH },
  openGraph: {
    type: 'website',
    title: `${title} — Запоминальня`,
    description,
    url: PAYMENT_RETURN_PATH,
    locale: 'ru_RU',
    siteName: 'Запоминальня',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Условия оплаты и возврата в «Запоминальне»',
      },
    ],
  },
  twitter: { card: 'summary_large_image', title, description, images: [DEFAULT_OG_IMAGE] },
};

export default function PaymentReturnPage() {
  return <LegalPage kind="payment" language="ru" />;
}
