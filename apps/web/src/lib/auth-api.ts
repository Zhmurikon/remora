'use client';

import { createApiClient, type ApiError } from '@remora/api-client';

export const authApi = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
});

export function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  ) {
    return (error as ApiError).message;
  }

  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';
