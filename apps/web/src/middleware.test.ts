import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

describe('security middleware', () => {
  it('выдаёт уникальный nonce и CSP без unsafe-inline', () => {
    const first = middleware(new NextRequest('https://remora.test/kursy'));
    const second = middleware(new NextRequest('https://remora.test/kursy'));
    const firstCsp = first.headers.get('content-security-policy') ?? '';
    const secondCsp = second.headers.get('content-security-policy') ?? '';

    expect(firstCsp).toContain("script-src 'self' 'nonce-");
    expect(firstCsp).toContain("frame-ancestors 'none'");
    expect(firstCsp).not.toContain('unsafe-inline');
    expect(firstCsp).not.toBe(secondCsp);
    expect(first.headers.get('x-frame-options')).toBe('DENY');
  });
});
