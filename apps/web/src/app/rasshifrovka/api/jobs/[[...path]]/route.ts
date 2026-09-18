import type { NextRequest } from 'next/server';
import { TRANSCRIBER_COOKIE, verifyTranscriberCookie } from '@/lib/transcriber-auth';

export const dynamic = 'force-dynamic';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  if (!verifyTranscriberCookie(request.cookies.get(TRANSCRIBER_COOKIE)?.value)) {
    return Response.json(
      { code: 'ACCESS_REQUIRED', message: 'Введите код доступа' },
      { status: 401 },
    );
  }
  const token = process.env.SECRET_KEY;
  if (!token) {
    return Response.json(
      { code: 'NOT_CONFIGURED', message: 'Инструмент пока не настроен' },
      { status: 503 },
    );
  }
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join('/');
  const headers: Record<string, string> = { 'X-Transcriber-Token': token };
  const contentType = request.headers.get('content-type');
  const contentLength = request.headers.get('content-length');
  if (contentType) headers['Content-Type'] = contentType;
  if (contentLength) headers['Content-Length'] = contentLength;
  try {
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : request.body,
      cache: 'no-store',
      signal: request.signal,
    };
    if (init.body) init.duplex = 'half';
    const upstream = await fetch(
      `${API_URL}/api/v1/internal/transcriptions${suffix ? `/${suffix}` : ''}`,
      init,
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { code: 'TRANSCRIBER_UNAVAILABLE', message: 'Сервис временно недоступен' },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
