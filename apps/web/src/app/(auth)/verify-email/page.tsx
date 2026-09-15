import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '../../../components/auth/VerifyEmail';

export const metadata: Metadata = {
  title: 'Подтверждение email',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
