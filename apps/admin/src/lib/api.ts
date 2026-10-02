import { createApiClient, type ApiError } from '@remora/api-client';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        setAccessToken(null);
        return false;
      }
      const body = (await response.json()) as { access_token: string };
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

export const api = createApiClient({
  baseUrl: '',
  getAccessToken: () => accessToken,
  onUnauthorized: refreshAccessToken,
});

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as Partial<ApiError>).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
