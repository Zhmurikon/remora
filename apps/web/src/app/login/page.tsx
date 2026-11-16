import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '../../components/auth/Logo';
import { LoginForm } from '../../components/auth/LoginForm';
import { ReadingRoom } from '../../components/auth/reading-room/ReadingRoom';
import './login.css';

export const metadata: Metadata = { title: 'Вход', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="reading-login">
      <header className="reading-header">
        <Logo />
        <Link href="/" className="reading-home">
          <span aria-hidden="true">←</span> На главную
        </Link>
      </header>
      <div className="reading-spread">
        <div className="reading-form">
          <LoginForm />
          <p className="reading-legal">
            Продолжая, вы принимаете <Link href="/terms">условия использования</Link> и{' '}
            <Link href="/privacy">политику конфиденциальности</Link>.
          </p>
        </div>
        <ReadingRoom />
      </div>
    </main>
  );
}
