'use client';

import { Button } from '@remora/ui';
import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const REASONS = [
  { value: 'misleading', label: 'Недостоверная информация' },
  { value: 'spam', label: 'Спам или реклама' },
  { value: 'copyright', label: 'Нарушение авторских прав' },
  { value: 'offensive', label: 'Оскорбления или вражда' },
  { value: 'adult', label: 'Материал для взрослых' },
  { value: 'other', label: 'Другое' },
] as const;

// Решения принимаются по code из единого формата ошибок, а не по тексту сообщения.
const MESSAGES: Record<string, string> = {
  CONFLICT: 'Вы уже отправили жалобу на этот курс. Модератор её рассмотрит.',
  FORBIDDEN: 'На собственный курс пожаловаться нельзя.',
  RATE_LIMITED: 'Слишком много жалоб подряд. Попробуйте позже.',
  NOT_FOUND: 'Курс больше не опубликован.',
};

export function ReportCourseForm({
  slug,
  onClose,
  onSent,
}: {
  slug: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const reasonSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    reasonSelect.current?.focus();
  }, []);
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const refresh = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refresh.ok) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.href)}`);
        return;
      }
      const { access_token } = (await refresh.json()) as { access_token: string };
      const response = await fetch(
        `${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/report`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason, comment }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        throw new Error(body.code ?? 'UNKNOWN');
      }
      onSent();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'UNKNOWN';
      setError(MESSAGES[code] ?? 'Не удалось отправить жалобу. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      aria-label="Жалоба на курс"
      onSubmit={submit}
      className="border-border bg-surface mt-2 max-w-md space-y-3 rounded-xl border p-4"
    >
      <fieldset className="space-y-1.5">
        <legend className="text-fg text-sm font-medium">Причина</legend>
        <select
          ref={reasonSelect}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Причина жалобы"
          className="bg-surface text-fg border-border h-11 w-full rounded-md border px-3 text-base"
        >
          {REASONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-fg text-sm font-medium">Что не так (необязательно)</span>
        <textarea
          value={comment}
          maxLength={2000}
          rows={3}
          onChange={(event) => setComment(event.target.value)}
          className="bg-surface text-fg border-border placeholder:text-fg-subtle w-full rounded-md border px-3 py-2 text-base"
          placeholder="Опишите проблему, это поможет модератору"
        />
      </label>
      <p className="text-fg-subtle text-sm">
        Жалоба не скрывает курс: решение принимает модератор.
      </p>
      <div className="flex flex-wrap gap-3">
        {/* min-h-11: цель нажатия от 44px, размер md у Button даёт только 40px. */}
        <Button type="submit" variant="secondary" loading={loading} className="min-h-11">
          Отправить жалобу
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={loading}
          onClick={onClose}
        >
          Отмена
        </Button>
      </div>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
