import Link from 'next/link';
import { FishMark } from '@remora/ui';

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Remora — на главную">
      <FishMark className="h-11 w-11 shrink-0" />
      <span
        className={`text-xl font-bold tracking-[-0.03em] ${inverted ? 'text-white' : 'text-fg'}`}
      >
        Remora
      </span>
    </Link>
  );
}
