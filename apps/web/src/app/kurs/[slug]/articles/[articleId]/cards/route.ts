import type { NextRequest } from 'next/server';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; articleId: string }> },
) {
  const { slug, articleId } = await params;
  const query = new URLSearchParams();
  for (const key of ['after', 'revision']) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  try {
    const upstream = await fetch(
      `${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/articles/${encodeURIComponent(articleId)}?${query}`,
      { cache: 'no-store', signal: request.signal },
    );
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { code: 'UPSTREAM_UNAVAILABLE', message: 'Материалы временно недоступны' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
