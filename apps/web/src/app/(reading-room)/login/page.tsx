import type { Metadata } from 'next';
import { LoginForm } from '../../../components/auth/LoginForm';
import { ReadingLegal } from '../../../components/auth/reading-room/ReadingLegal';

export const metadata: Metadata = { title: 'Вход', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <ReadingLegal />
    </>
  );
}
