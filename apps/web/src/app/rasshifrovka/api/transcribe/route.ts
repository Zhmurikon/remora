import type { NextRequest } from 'next/server';
import { TRANSCRIBER_COOKIE, verifyTranscriberCookie } from '@/lib/transcriber-auth';

export const dynamic = 'force-dynamic';
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function error(code: string, message: string, status: number) {
  return Response.json({ code, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const access = request.cookies.get(TRANSCRIBER_COOKIE)?.value;
  if (!verifyTranscriberCookie(access)) return error('ACCESS_REQUIRED', 'Введите код доступа', 401);
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;')) {
    return error('INVALID_REQUEST', 'Выберите аудио или видеофайл', 400);
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return error('FILE_TOO_LARGE', 'Файл должен быть не больше 1 ГБ', 413);
  }
  const apiKey = process.env.FASTER_WHISPER_API_KEY;
  const upstreamUrl = process.env.FASTER_WHISPER_URL ?? 'http://host.docker.internal:8178';
  if (!apiKey) return error('NOT_CONFIGURED', 'Инструмент пока не настроен', 503);
  try {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'X-API-Key': apiKey },
      body: request.body,
      duplex: 'half',
      cache: 'no-store',
      signal: request.signal,
    };
    const upstream = await fetch(`${upstreamUrl.replace(/\/$/, '')}/transcribe`, init);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return error(
      'TRANSCRIBER_UNAVAILABLE',
      'Сервис расшифровки временно недоступен. Попробуйте ещё раз',
      503,
    );
  }
}
