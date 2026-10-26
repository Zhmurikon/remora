import createOpenApiClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './generated/schema';

export type { paths, components } from './generated/schema';

export interface CreateClientOptions {
  /** База API, например http://localhost:8000 */
  baseUrl: string;
  /** Возвращает текущий access-токен. Вызывается перед каждым запросом. */
  getAccessToken?: () => string | null | undefined;
  /** Дополнительные короткоживущие заголовки, например сессия административного 2FA. */
  getHeaders?: () => Record<string, string>;
  /**
   * Вызывается при 401. Должен обновить токен и вернуть true, если запрос
   * можно повторить. Реализация single-flight — на стороне приложения.
   */
  onUnauthorized?: () => Promise<boolean>;
}

/** Ошибка API в едином формате бэкенда. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function isLimitExceeded(error: unknown): error is ApiError {
  return (
    typeof error === 'object' && error !== null && (error as ApiError).code === 'LIMIT_EXCEEDED'
  );
}

export function createApiClient({
  baseUrl,
  getAccessToken,
  getHeaders,
  onUnauthorized,
}: CreateClientOptions) {
  const client = createOpenApiClient<paths>({
    baseUrl,
    credentials: 'include',
  });

  // fetch потребляет тело запроса. Копию для повторной отправки сохраняем до него.
  const retryRequests = new WeakMap<Request, Request>();

  const auth: Middleware = {
    async onRequest({ request }) {
      const token = getAccessToken?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      for (const [name, value] of Object.entries(getHeaders?.() ?? {})) {
        request.headers.set(name, value);
      }
      if (onUnauthorized) retryRequests.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status !== 401 || !onUnauthorized) return response;
      const refreshed = await onUnauthorized();
      if (!refreshed) return response;

      const original = retryRequests.get(request);
      if (!original) return response;
      const retry = new Request(original);
      const token = getAccessToken?.();
      if (token) retry.headers.set('Authorization', `Bearer ${token}`);
      for (const [name, value] of Object.entries(getHeaders?.() ?? {})) {
        retry.headers.set(name, value);
      }
      return fetch(retry);
    },
  };

  client.use(auth);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
