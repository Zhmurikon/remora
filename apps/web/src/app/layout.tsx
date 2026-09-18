import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DEFAULT_OG_IMAGE } from '../lib/seo';

export const metadata: Metadata = {
  title: {
    default: 'Remora — карточки для заучивания',
    template: '%s — Remora',
  },
  description:
    'Карточки для заучивания и запоминания. Все режимы обучения бесплатны, в основе — алгоритм интервальных повторений FSRS.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Remora',
    title: 'Remora — карточки для заучивания',
    description:
      'Карточки для заучивания и запоминания с бесплатными режимами обучения и алгоритмом FSRS.',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Remora' }],
  },
  twitter: { card: 'summary_large_image', images: [DEFAULT_OG_IMAGE] },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
