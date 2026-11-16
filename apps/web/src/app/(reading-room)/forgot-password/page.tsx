import type { Metadata } from 'next';
import { ForgotPasswordForm } from '../../../components/auth/ForgotPasswordForm';
import { ReadingLegal } from '../../../components/auth/reading-room/ReadingLegal';

export const metadata: Metadata = {
  title: 'Восстановление пароля',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <ForgotPasswordForm />
      <ReadingLegal />
    </>
  );
}
