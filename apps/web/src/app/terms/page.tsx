import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Условия использования',
  description: 'Основные правила использования сайта и приложений Remora.',
  alternates: {
    canonical: '/terms',
    languages: { ru: '/terms', en: '/en/terms' },
  },
};

export default function TermsPage() {
  return <LegalPage kind="terms" language="ru" />;
}
