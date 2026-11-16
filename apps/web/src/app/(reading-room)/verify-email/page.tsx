import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '../../../components/auth/VerifyEmail';
import { ReadingLegal } from '../../../components/auth/reading-room/ReadingLegal';

export const metadata: Metadata = {
  title: 'Подтверждение email',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <>
      <Suspense>
        <VerifyEmail />
      </Suspense>
      <ReadingLegal />
    </>
  );
}
