import type { NextRequest } from 'next/server';
import {
  createTranscriberCookieValue,
  TRANSCRIBER_COOKIE_MAX_AGE,
  transcriberIsConfigured,
  verifyTranscriberCode,
  YANDEX_TRANSCRIBER_COOKIE,
} from '@/lib/transcriber-auth';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function requestIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  if (!transcriberIsConfigured('yandex_speechkit')) {
    return Response.json(
      { code: 'NOT_CONFIGURED', message: 'Подключение к SpeechKit пока не настроено' },
      { status: 503 },
    );
  }
  const ip = requestIp(request);
  const now = Date.now();
  const current = attempts.get(ip);
  const attempt =
    !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  if (attempt.count >= MAX_ATTEMPTS) {
    return Response.json(
      { code: 'TOO_MANY_ATTEMPTS', message: 'Слишком много попыток. Попробуйте позже' },
      { status: 429 },
    );
  }
  let code = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code === 'string') code = body.code;
  } catch {
    return Response.json(
      { code: 'INVALID_REQUEST', message: 'Введите код доступа' },
      { status: 400 },
    );
  }
  if (!verifyTranscriberCode(code)) {
    attempts.set(ip, { ...attempt, count: attempt.count + 1 });
    return Response.json({ code: 'INVALID_CODE', message: 'Код не подошёл' }, { status: 401 });
  }
  attempts.delete(ip);
  const response = Response.json({ status: 'ok' });
  response.headers.append(
    'Set-Cookie',
    `${YANDEX_TRANSCRIBER_COOKIE}=${createTranscriberCookieValue('yandex_speechkit')}; Max-Age=${TRANSCRIBER_COOKIE_MAX_AGE}; Path=/rasshifrovka-yandex; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}
