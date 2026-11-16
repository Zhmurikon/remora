import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '../../../components/auth/ResetPasswordForm';
import { ReadingLegal } from '../../../components/auth/reading-room/ReadingLegal';

export const metadata: Metadata = {
  title: 'Новый пароль',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
      <ReadingLegal />
    </>
  );
}
