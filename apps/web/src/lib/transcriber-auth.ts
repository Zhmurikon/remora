import { createHmac, timingSafeEqual } from 'node:crypto';

export const TRANSCRIBER_COOKIE = 'remora_transcriber_access';
export const TRANSCRIBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

function digest(value: string) {
  return createHmac('sha256', process.env.SECRET_KEY ?? '')
    .update(value)
    .digest();
}

export function transcriberIsConfigured() {
  return Boolean(
    process.env.SECRET_KEY &&
    process.env.TRANSCRIBER_ACCESS_CODE &&
    process.env.FASTER_WHISPER_API_KEY,
  );
}

export function verifyTranscriberCode(value: string) {
  const expected = process.env.TRANSCRIBER_ACCESS_CODE;
  if (!expected) return false;
  return timingSafeEqual(digest(value), digest(expected));
}

export function createTranscriberCookieValue() {
  return `v1.${digest('transcriber-access-v1').toString('base64url')}`;
}

export function verifyTranscriberCookie(value: string | undefined) {
  if (!value || !transcriberIsConfigured()) return false;
  const expected = createTranscriberCookieValue();
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
