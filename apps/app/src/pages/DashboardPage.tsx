import { Button, Card } from '@remora/ui';
import { useAuthStore } from '../features/auth/auth-store';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const name = user?.display_name || user?.username || 'друг';
  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-primary text-sm font-medium">Ваш кабинет</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Привет, {name}!
          </h1>
          <p className="text-fg-muted mt-3 max-w-xl">
            Соберите первый набор карточек, а Remora поможет заниматься регулярно.
          </p>
        </div>
        <Button size="lg" disabled>
          Создать набор
        </Button>
      </header>
      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Статистика">
        <Stat label="Наборов" />
        <Stat label="Карточек изучено" />
        <Stat label="Дней подряд" />
      </section>
      <Card className="mt-6 overflow-hidden p-0">
        <div className="grid min-h-80 place-items-center px-6 py-14 text-center">
          <div>
            <span
              className="bg-primary-subtle text-primary mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl"
              aria-hidden="true"
            >
              ＋
            </span>
            <h2 className="mt-5 text-xl font-semibold">Здесь появятся ваши наборы</h2>
            <p className="text-fg-muted mx-auto mt-2 max-w-md">
              Редактор карточек будет следующим большим этапом разработки.
            </p>
            <Button className="mt-6" disabled>
              Создать первый набор
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <Card className="p-5">
      <p className="text-fg-muted text-sm">{label}</p>
      <p className="mt-2 text-3xl font-semibold">0</p>
    </Card>
  );
}
