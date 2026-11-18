import { createApiClient } from '@remora/api-client';
import { useAuthStore } from '../features/auth/auth-store';

let authSession = 0;
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.status !== previous.status) authSession += 1;
});

/**
 * Access-токен живёт только в памяти: в localStorage его класть нельзя (XSS).
 * Refresh-токен — в httpOnly cookie, его выставляет и читает сервер.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  authSession += 1;
  setAccessToken(null);
}

/**
 * Single-flight обновление токена: десять параллельных 401 не должны
 * породить десять запросов на refresh.
 */
let refreshInFlight: { session: number; promise: Promise<boolean> } | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight?.session === authSession) return refreshInFlight.promise;
  const session = authSession;
  const ownerId = useAuthStore.getState().user?.id;
  const promise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (session !== authSession) return false;
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const body = (await res.json()) as { access_token: string };
      if (session !== authSession) return false;
      // Cookie общая между вкладками: refresh не должен менять владельца открытого кабинета.
      if (ownerId && tokenSubject(body.access_token) !== ownerId) {
        clearAccessToken();
        useAuthStore.getState().becomeGuest();
        return false;
      }
      setAccessToken(body.access_token);
      return true;
    } catch {
      if (session === authSession) setAccessToken(null);
      return false;
    } finally {
      if (refreshInFlight?.session === session) refreshInFlight = null;
    }
  })();
  refreshInFlight = { session, promise };
  return promise;
}

function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const value = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    ) as { sub?: unknown };
    return typeof value.sub === 'string' ? value.sub : null;
  } catch {
    return null;
  }
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

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Загружает одну часть большого файла с тем же обновлением access-токена, что и API-клиент. */
export async function uploadTranscriptionChunk<T>(path: string, chunk: Blob): Promise<T> {
  const request = async () =>
    fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: chunk,
    });

  let response = await request();
  if (response.status === 401 && (await refreshAccessToken())) response = await request();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    } | null;
    throw new ApiRequestError(
      body?.message ?? 'Не удалось загрузить часть файла',
      body?.code,
      body?.details,
    );
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
