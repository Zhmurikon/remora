import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности',
  description: 'Как «Запоминальня» получает, использует, хранит и защищает данные пользователей.',
  alternates: {
    canonical: '/privacy',
    languages: { ru: '/privacy', en: '/en/privacy' },
  },
};

export default function PrivacyPage() {
  return <LegalPage kind="privacy" language="ru" />;
}
