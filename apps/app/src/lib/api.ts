import { createApiClient } from '@remora/api-client';

/**
 * Access-токен живёт только в памяти: в localStorage его класть нельзя (XSS).
 * Refresh-токен — в httpOnly cookie, его выставляет и читает сервер.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Single-flight обновление токена: десять параллельных 401 не должны
 * породить десять запросов на refresh.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const body = (await res.json()) as { access_token: string };
      setAccessToken(body.access_token);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => accessToken,
  onUnauthorized: refreshAccessToken,
});
