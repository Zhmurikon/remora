'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type SaveTarget = 'course' | 'article' | 'set';

export function useLibrarySave() {
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);

  const isSaved = (type: SaveTarget, id: string) => saved.has(`${type}:${id}`);

  async function save(targetType: SaveTarget, targetId: string, message: string) {
    if (pending || isSaved(targetType, targetId)) return;
    setPending(true);
    setFeedback(null);
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
      const response = await fetch(`${API_URL}/api/v1/library`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          ...(targetType === 'article' ? { text_only: true } : {}),
        }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(problem?.message || 'Не удалось сохранить. Попробуйте ещё раз.');
      }
      setSaved((previous) => new Set(previous).add(`${targetType}:${targetId}`));
      setFeedback({ message, error: false });
    } catch (reason) {
      setFeedback({
        message:
          reason instanceof Error ? reason.message : 'Не удалось сохранить. Попробуйте ещё раз.',
        error: true,
      });
    } finally {
      setPending(false);
    }
  }

  return { save, isSaved, pending, feedback };
}
