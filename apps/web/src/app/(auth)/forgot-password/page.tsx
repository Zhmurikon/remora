import type { Metadata } from 'next';
import { ForgotPasswordForm } from '../../../components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Восстановление пароля',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
