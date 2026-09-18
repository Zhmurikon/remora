import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Platform = components['schemas']['BotPlatform'];
type Code = components['schemas']['BotCodeCreated'] & { platform: Platform };
const names: Record<Platform, string> = { telegram: 'Telegram', vk: 'VK' };
function errorText(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

export function BotConnections() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState<Code | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['bot-connections'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/bots');
      if (error) throw new Error(errorText(error));
      return data;
    },
    refetchInterval: code ? 3000 : false,
  });
  useEffect(() => {
    if (!code) return;
    if (query.data?.some((link) => link.platform === code.platform)) {
      setCode(null);
      setMessage('Бот подключён.');
      return;
    }
    const timeout = window.setTimeout(
      () => {
        setCode(null);
        setMessage('Код истёк. Получите новый, если ещё не подключили бота.');
      },
      Math.max(0, Date.parse(code.expires_at) - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [code, query.data]);

  async function create(platform: Platform) {
    setBusy(true);
    setMessage(null);
    setCode(null);
    try {
      const { data, error } = await api.POST('/api/v1/users/me/bots/code', { body: { platform } });
      if (error) throw new Error(errorText(error));
      setCode({ ...data, platform });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Не удалось получить код. Попробуйте ещё раз.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Отключить бота? Ваши материалы и прогресс останутся в Remora.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await api.DELETE('/api/v1/users/me/bots/{link_id}', {
        params: { path: { link_id: id } },
      });
      if (error) throw new Error(errorText(error));
      await queryClient.invalidateQueries({ queryKey: ['bot-connections'] });
      setMessage('Бот отключён.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Не удалось отключить бота. Попробуйте ещё раз.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-6" id="bots">
      <h2 className="text-xl font-semibold">Боты Telegram и VK</h2>
      <p className="text-fg-muted mt-2 text-sm">
        Свяжите аккаунт с ботом в личных сообщениях. После подключения можно учить карточки во всех
        пяти режимах, продолжать общую с кабинетом сессию и читать статьи курсов.
      </p>
      {query.isPending && (
        <p role="status" className="mt-4">
          Загружаем подключения…
        </p>
      )}
      {query.isError && (
        <div className="mt-4">
          <p role="alert" className="text-danger">
            {query.error.message}
          </p>
          <Button
            variant="secondary"
            className="mt-2 min-h-11"
            onClick={() => void query.refetch()}
          >
            Повторить
          </Button>
        </div>
      )}
      {query.data && (
        <div className="divide-border mt-4 divide-y">
          {(['telegram', 'vk'] as const).map((platform) => {
            const link = query.data.find((item) => item.platform === platform);
            return (
              <div
                key={platform}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <h3 className="font-medium">{names[platform]}</h3>
                  <p className="text-fg-muted text-sm">
                    {link ? `Подключён · ID ${link.actor_id}` : 'Не подключён'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void (link ? revoke(link.id) : create(platform))}
                >
                  {link ? `Отключить ${names[platform]}` : `Подключить ${names[platform]}`}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {code && (
        <div className="bg-surface-muted mt-4 space-y-3 rounded-xl p-4">
          <p>Отправьте эту команду боту {names[code.platform]} в личном сообщении:</p>
          <Input
            label="Команда привязки"
            readOnly
            value={`/link ${code.code}`}
            className="font-mono"
          />
          <p className="text-fg-muted text-sm">
            Код действует 10 минут и используется один раз. Не отправляйте его другим людям. Новый
            код для этого мессенджера отменяет предыдущий.
          </p>
          {code.bot_url && (
            <a
              className="text-primary inline-flex min-h-11 items-center underline"
              href={code.bot_url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Открыть {names[code.platform]}
            </a>
          )}
          <Button variant="ghost" className="min-h-11" onClick={() => setCode(null)}>
            Скрыть код
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
    </Card>
  );
}
