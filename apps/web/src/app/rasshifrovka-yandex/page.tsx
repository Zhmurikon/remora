import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { FishMark } from '@remora/ui';
import { verifyTranscriberCookie, YANDEX_TRANSCRIBER_COOKIE } from '@/lib/transcriber-auth';
import { Transcriber } from '../rasshifrovka/Transcriber';
import '../rasshifrovka/transcriber.css';

export const metadata: Metadata = {
  title: 'Расшифровка через SpeechKit',
  description: 'Закрытая проверка отложенного распознавания речи через Yandex SpeechKit.',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function YandexTranscriberPage() {
  const cookieStore = await cookies();
  const initialAccess = verifyTranscriberCookie(
    cookieStore.get(YANDEX_TRANSCRIBER_COOKIE)?.value,
    'yandex_speechkit',
  );
  return (
    <main className="transcriber-page">
      <header className="transcriber-topbar">
        <a href="/" className="transcriber-brand" aria-label="Remora, на главную">
          <FishMark /> <span>Remora</span>
        </a>
        <span className="transcriber-private">Личный эксперимент</span>
      </header>
      <section className="transcriber-heading">
        <h1>Проверьте расшифровку через SpeechKit</h1>
        <div>
          Запись обрабатывается моделью deferred-general в фоне. После загрузки страницу можно
          закрыть и вернуться к результату позже.
        </div>
      </section>
      <Transcriber initialAccess={initialAccess} provider="yandex_speechkit" />
    </main>
  );
}
