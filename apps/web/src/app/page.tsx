import { Badge, Button, Card, CardDescription, CardTitle } from '@remora/ui';
import { STUDY_MODES, STUDY_MODE_LABELS, pluralWithCount } from '@remora/core';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';

async function getApiStatus(): Promise<{ ok: boolean; environment?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/v1/health`, { cache: 'no-store' });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { environment: string };
    return { ok: true, environment: body.environment };
  } catch {
    return { ok: false };
  }
}

export default async function HomePage() {
  const api = await getApiStatus();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Remora</h1>
          <Badge tone="primary">E0 — каркас</Badge>
        </div>
        <p className="text-fg-muted text-lg">
          Карточки для заучивания и запоминания. Все режимы обучения бесплатны, в основе — алгоритм
          интервальных повторений FSRS.
        </p>
      </header>

      <Card>
        <CardTitle>Состояние окружения</CardTitle>
        <CardDescription className="mt-1">
          Публичный сайт собран, дизайн-система подключена.
        </CardDescription>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="border-border flex items-center justify-between border-b pb-2">
            <dt className="text-fg-muted">Публичный сайт (Next.js)</dt>
            <dd>
              <Badge tone="success">работает</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">API (FastAPI)</dt>
            <dd>
              {api.ok ? (
                <Badge tone="success">работает · {api.environment}</Badge>
              ) : (
                <Badge tone="warning">не отвечает</Badge>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle>Режимы обучения</CardTitle>
        <CardDescription className="mt-1">
          {pluralWithCount(STUDY_MODES.length, ['режим', 'режима', 'режимов'])}, все бесплатны на
          любом тарифе.
        </CardDescription>
        <ul className="mt-4 flex flex-wrap gap-2">
          {STUDY_MODES.map((mode) => (
            <li key={mode}>
              <Badge>{STUDY_MODE_LABELS[mode]}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex gap-3">
        <Button>Начать учиться</Button>
        <Button variant="secondary">Каталог наборов</Button>
      </div>
    </main>
  );
}
