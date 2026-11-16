import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ReadingRoom } from '../../components/auth/reading-room/ReadingRoom';
import './reading-room.css';

export default function ReadingRoomLayout({ children }: { children: ReactNode }) {
  return (
    <main className="reading-login">
      <header className="reading-header">
        <Link href="/" className="reading-brand" aria-label="Запоминальня — на главную">
          <Image src="/lecture-demo/remora-icon.png" width={64} height={64} alt="" />
          <span className="reading-wordmark" aria-hidden="true">
            {Array.from('Запоминальня', (letter, i) => (
              <span key={i} style={{ animationDelay: `${105 + i * 32}ms` }}>
                {letter}
              </span>
            ))}
          </span>
        </Link>
        <Link href="/" className="reading-home">
          <span aria-hidden="true">←</span> На главную
        </Link>
      </header>
      <div className="reading-spread">
        <div className="reading-form">{children}</div>
        <ReadingRoom />
      </div>
    </main>
  );
}
