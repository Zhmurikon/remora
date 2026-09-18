'use client';

import { Button } from '@remora/ui';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export function SaveOriginalButton({
  targetType,
  targetId,
  label,
}: {
  targetType: 'course' | 'article' | 'set';
  targetId: string;
  label: string;
}) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
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
      const response = await fetch(`${API_URL}/api/v1/library`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      });
      if (!response.ok) throw new Error();
      setSaved(true);
    } catch {
      setError('Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" loading={loading} disabled={saved} onClick={save}>
        {saved ? 'Сохранено' : label}
      </Button>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </div>
  );
}
