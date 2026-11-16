import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../../components/auth/LoginForm';

export const metadata: Metadata = { title: 'Вход', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <p className="reading-legal">
        Продолжая, вы принимаете <Link href="/terms">условия использования</Link> и{' '}
        <Link href="/privacy">политику конфиденциальности</Link>.
      </p>
    </>
  );
}
