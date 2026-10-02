import type { Metadata } from 'next';
import { LegalPage } from '../../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The basic rules for using the Remora website and applications.',
  alternates: {
    canonical: '/en/terms',
    languages: { ru: '/terms', en: '/en/terms' },
  },
};

export default function TermsPageEn() {
  return <LegalPage kind="terms" language="en" />;
}
