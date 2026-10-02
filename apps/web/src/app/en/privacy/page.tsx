import type { Metadata } from 'next';
import { LegalPage } from '../../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Remora collects, uses, stores, and protects user data.',
  alternates: {
    canonical: '/en/privacy',
    languages: { ru: '/privacy', en: '/en/privacy' },
  },
};

export default function PrivacyPageEn() {
  return <LegalPage kind="privacy" language="en" />;
}
