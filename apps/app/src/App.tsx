import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardDescription, CardTitle } from '@remora/ui';
import { STUDY_MODES, STUDY_MODE_LABELS } from '@remora/core';
import { api } from './lib/api';

export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/health');
      if (error) throw new Error('API недоступен');
      return data;
    },
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Remora</h1>
        <Badge tone="primary">кабинет · E0</Badge>
      </header>

      <Card>
        <CardTitle>Связь с API</CardTitle>
        <CardDescription className="mt-1">
          Запрос идёт через сгенерированный из OpenAPI клиент.
        </CardDescription>
        <p className="mt-4 text-sm">
          {health.isPending && <Badge>проверяю…</Badge>}
          {health.isError && <Badge tone="warning">API не отвечает</Badge>}
          {health.data && <Badge tone="success">работает · {health.data.environment}</Badge>}
        </p>
      </Card>

      <Card>
        <CardTitle>Режимы обучения</CardTitle>
        <ul className="mt-4 flex flex-wrap gap-2">
          {STUDY_MODES.map((mode) => (
            <li key={mode}>
              <Badge>{STUDY_MODE_LABELS[mode]}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Button>Учить</Button>
    </main>
  );
}
