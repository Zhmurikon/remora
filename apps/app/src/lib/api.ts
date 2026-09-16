import { createApiClient } from '@remora/api-client';

/**
 * Access-токен живёт только в памяти: в localStorage его класть нельзя (XSS).
 * Refresh-токен — в httpOnly cookie, его выставляет и читает сервер.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  setAccessToken(null);
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

/**
 * Запрос за бинарным ответом (PDF на печать).
 *
 * Обычная ссылка сюда не годится: access-токен живёт только в памяти и в
 * заголовок `<a href>` не попадёт. Поэтому файл забираем этим fetch и
 * открываем как blob.
 */
export async function fetchBlob(path: string): Promise<Blob> {
  const request = async () =>
    fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

  let response = await request();
  if (response.status === 401 && (await refreshAccessToken())) {
    response = await request();
  }
  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? 'Печать сейчас недоступна на сервере'
        : 'Не удалось подготовить документ',
    );
  }
  return response.blob();
}

/** Скачивает защищённый файл, сохраняя предложенное клиентом имя. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function uploadBinary<T>(path: string, file: File): Promise<T> {
  const request = async () =>
    fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: file,
    });

  let response = await request();
  if (response.status === 401 && (await refreshAccessToken())) response = await request();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Не удалось импортировать файл');
  }
  return (await response.json()) as T;
}

/** Открывает полученный файл в новой вкладке — оттуда пользователь печатает. */
export async function openPdf(path: string): Promise<void> {
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Освобождаем ссылку не сразу: вкладке нужно успеть её прочитать.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
