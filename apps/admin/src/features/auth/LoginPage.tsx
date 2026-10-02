import { Button, Card, FishMark, Input } from '@remora/ui/base';
import { useState, type FormEvent } from 'react';
import { api, getErrorMessage } from '../../lib/api';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { authenticate } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: apiError } = await api.POST('/api/v1/auth/login', {
        body: { email, password },
      });
      if (!data) {
        setError(getErrorMessage(apiError, 'Не удалось войти. Проверьте данные и повторите.'));
        return;
      }
      if (data.user.role !== 'admin') {
        await api.POST('/api/v1/auth/logout');
        setError('Этот аккаунт не имеет доступа к управлению Remora.');
        return;
      }
      authenticate(data.user, data.access_token);
    } catch {
      setError('Сервер недоступен. Повторите попытку позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <FishMark className="h-12 w-12" />
          <div>
            <p className="text-xl font-semibold">Remora</p>
            <p className="text-fg-muted text-sm">Служебная панель</p>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Вход для администратора</h1>
        <p className="text-fg-muted mt-2 text-sm">
          Используйте существующий аккаунт с ролью администратора.
        </p>
        <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
          <Input
            label="Электронная почта"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Пароль"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p
              className="border-danger/30 bg-danger-subtle text-danger rounded-md border p-3 text-sm"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button type="submit" fullWidth loading={loading} className="min-h-11">
            Войти
          </Button>
        </form>
      </Card>
    </main>
  );
}
