import { Button, Card, Input } from '@remora/ui/base';
import { useState, type FormEvent } from 'react';
import { api, getErrorMessage } from '../../lib/api';

interface AdminActionConfirmationProps {
  title: string;
  consequences: string[];
  submitLabel: string;
  onConfirmed: (confirmationToken: string, reason: string) => void | Promise<void>;
  onCancel: () => void;
}

/** Единая форма-предохранитель для изменяющих административных операций. */
export function AdminActionConfirmation({
  title,
  consequences,
  submitLabel,
  onConfirmed,
  onCancel,
}: AdminActionConfirmationProps) {
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: apiError } = await api.POST('/api/v1/admin/security/confirm', {
        body: { code },
      });
      if (!data) {
        setError(getErrorMessage(apiError, 'Не удалось подтвердить действие.'));
        return;
      }
      await onConfirmed(data.confirmation_token, reason.trim());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Сервер недоступен. Повторите попытку позже.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-danger/30 p-5 shadow-none" role="group" aria-labelledby="action-title">
      <h2 id="action-title" className="text-xl font-semibold">
        {title}
      </h2>
      <div className="bg-danger-subtle mt-4 rounded-md p-4">
        <p className="font-medium">Что произойдёт</p>
        <ul className="text-fg-muted mt-2 list-disc space-y-1 pl-5 text-sm">
          {consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <Input
          label="Причина изменения"
          required
          minLength={10}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Input
          label="Код подтверждения"
          autoComplete="one-time-code"
          required
          minLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        {error && (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" loading={loading}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
