import Link from 'next/link';

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Remora — на главную">
      <span className="bg-primary text-primary-fg relative grid h-11 w-11 grid-cols-2 gap-0.5 rounded-2xl p-2 shadow-[0_8px_24px_rgb(var(--rm-primary)/0.2)]">
        <span className="rounded-full bg-current opacity-100" />
        <span className="rounded-full bg-current opacity-75" />
        <span className="rounded-full bg-current opacity-75" />
        <span className="rounded-full bg-current opacity-100" />
      </span>
      <span
        className={`text-xl font-bold tracking-[-0.03em] ${inverted ? 'text-white' : 'text-fg'}`}
      >
        Remora
      </span>
    </Link>
  );
}
