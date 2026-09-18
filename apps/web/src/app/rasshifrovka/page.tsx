import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { FishMark } from '@remora/ui';
import { TRANSCRIBER_COOKIE, verifyTranscriberCookie } from '@/lib/transcriber-auth';
import { Transcriber } from './Transcriber';
import './transcriber.css';

export const metadata: Metadata = {
  title: 'Расшифровка',
  description: 'Закрытый инструмент расшифровки аудио и видео.',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function TranscriberPage() {
  const cookieStore = await cookies();
  const initialAccess = verifyTranscriberCookie(cookieStore.get(TRANSCRIBER_COOKIE)?.value);
  return (
    <main className="transcriber-page">
      <header className="transcriber-topbar">
        <a href="/" className="transcriber-brand" aria-label="Remora, на главную">
          <FishMark /> <span>Remora</span>
        </a>
        <span className="transcriber-private">Личный инструмент</span>
      </header>
      <section className="transcriber-heading">
        <p>Расшифровка</p>
        <h1>Превратите запись в аккуратный текст</h1>
        <div>
          Загрузите аудио или видео. Русская речь и английские термины распознаются моделью
          large-v3.
        </div>
      </section>
      <Transcriber initialAccess={initialAccess} />
    </main>
  );
}
