import type { ReactNode } from 'react';
import { BookIcon, ChartIcon, SparkIcon } from './Icons';
import { Logo } from './Logo';

interface AuthShellProps {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
}

export function AuthShell({
  children,
  eyebrow = 'Учитесь в своём ритме',
  title = 'Запоминайте больше. Повторяйте вовремя.',
  description = 'Remora помогает превратить любые заметки в карточки и строит расписание повторений за вас.',
}: AuthShellProps) {
  return (
    <main className="auth-page bg-bg text-fg min-h-dvh p-3 sm:p-5 lg:p-7">
      <div className="border-border/80 bg-surface mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1440px] overflow-hidden rounded-[2rem] border shadow-[0_30px_100px_rgb(0_0_0/0.16)] sm:min-h-[calc(100dvh-2.5rem)] lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(420px,0.92fr)_minmax(520px,1.08fr)]">
        <section className="relative hidden overflow-hidden bg-[#0b1009] p-12 text-white lg:flex lg:flex-col xl:p-16">
          <div className="auth-glow absolute inset-0" aria-hidden="true" />
          <div className="relative z-10">
            <Logo inverted />
          </div>

          <div className="relative z-10 my-auto max-w-xl py-16">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 backdrop-blur">
              <SparkIcon className="text-primary h-4 w-4" />
              {eyebrow}
            </p>
            <h2 className="max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-5xl">
              {title}
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-white/60">{description}</p>

            <div className="relative mt-12 h-[260px] max-w-[560px]" aria-hidden="true">
              <div className="absolute left-4 top-0 w-[72%] rotate-[-3deg] rounded-[1.75rem] border border-white/10 bg-[#171d14]/95 p-6 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between text-sm text-white/55">
                  <span>Сегодня</span>
                  <span className="bg-primary/15 text-primary rounded-full px-3 py-1">
                    12 карточек
                  </span>
                </div>
                <p className="mt-8 text-2xl font-medium">Что такое интервальное повторение?</p>
                <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="bg-primary h-full w-2/3 rounded-full" />
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-[58%] rotate-[4deg] rounded-[1.75rem] border border-white/10 bg-[#20251d]/95 p-5 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-3">
                  <span className="bg-primary text-primary-fg grid h-11 w-11 place-items-center rounded-2xl">
                    <ChartIcon />
                  </span>
                  <div>
                    <p className="text-xs text-white/45">Прогресс недели</p>
                    <p className="mt-0.5 text-lg font-medium">84% изучено</p>
                  </div>
                </div>
                <div className="mt-5 flex h-20 items-end gap-2">
                  {[38, 56, 42, 72, 62, 90, 78].map((height, index) => (
                    <span
                      key={index}
                      className="bg-primary/80 flex-1 rounded-t-md"
                      style={{ height: `${height}%`, opacity: 0.4 + index * 0.08 }}
                    />
                  ))}
                </div>
              </div>
              <span className="absolute bottom-8 left-0 grid h-16 w-16 place-items-center rounded-3xl border border-white/10 bg-[#d8ff7d] text-[#17200d] shadow-2xl">
                <BookIcon className="h-7 w-7" />
              </span>
            </div>
          </div>

          <p className="relative z-10 text-xs text-white/35">© 2026 Remora</p>
        </section>

        <section className="flex min-h-full flex-col px-5 py-6 sm:px-10 sm:py-8 lg:px-14 xl:px-24">
          <div className="mb-12 flex items-center justify-between lg:hidden">
            <Logo />
          </div>
          <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-4 sm:py-10">
            {children}
          </div>
          <p className="text-fg-subtle mt-10 text-center text-xs leading-5">
            Продолжая, вы принимаете{' '}
            <a href="#" className="decoration-border hover:text-fg underline underline-offset-4">
              условия использования
            </a>{' '}
            и{' '}
            <a href="#" className="decoration-border hover:text-fg underline underline-offset-4">
              политику конфиденциальности
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
