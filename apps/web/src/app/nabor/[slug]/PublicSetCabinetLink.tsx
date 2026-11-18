'use client';

import { useEffect, useState } from 'react';
import { usePublicSession } from '../../../components/auth/PublicSession';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export function PublicSetCabinetLink({ setId, appUrl }: { setId: string; appUrl: string }) {
  const session = usePublicSession();
  const [access, setAccess] = useState<{ id: string; allowed: boolean } | null>(null);

  useEffect(() => {
    setAccess(null);
    if (session !== 'authenticated') return;
    const controller = new AbortController();
    async function checkAccess() {
      try {
        const refresh = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!refresh.ok) return;
        const { access_token } = (await refresh.json()) as { access_token: string };
        // Публичное чтение не даёт права обучения: его подтверждает серверный контракт.
        const response = await fetch(`${API_URL}/api/v1/sets/${encodeURIComponent(setId)}`, {
          headers: { Authorization: `Bearer ${access_token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setAccess({ id: setId, allowed: response.ok });
      } catch {
        // Публичные карточки остаются доступны и при сбое проверки личной сессии.
      }
    }
    void checkAccess();
    return () => controller.abort();
  }, [session, setId]);

  if (session !== 'authenticated' || access?.id !== setId || !access.allowed) return null;
  return (
    <a className="ps-cabinet-link" href={`${appUrl}/sets/${encodeURIComponent(setId)}`}>
      Открыть набор в кабинете <span aria-hidden="true">→</span>
    </a>
  );
}
