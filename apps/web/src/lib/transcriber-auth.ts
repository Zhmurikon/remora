import { createHmac, timingSafeEqual } from 'node:crypto';

export const TRANSCRIBER_COOKIE = 'remora_transcriber_access';
export const YANDEX_TRANSCRIBER_COOKIE = 'remora_yandex_transcriber_access';
export const TRANSCRIBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
export type TranscriberProvider = 'faster_whisper' | 'yandex_speechkit';

function digest(value: string) {
  return createHmac('sha256', process.env.SECRET_KEY ?? '')
    .update(value)
    .digest();
}

export function transcriberIsConfigured(provider: TranscriberProvider = 'faster_whisper') {
  const providerKey =
    provider === 'yandex_speechkit'
      ? process.env.YANDEX_SPEECHKIT_API_KEY
      : process.env.FASTER_WHISPER_API_KEY;
  return Boolean(process.env.SECRET_KEY && process.env.TRANSCRIBER_ACCESS_CODE && providerKey);
}

export function verifyTranscriberCode(value: string) {
  const expected = process.env.TRANSCRIBER_ACCESS_CODE;
  if (!expected) return false;
  return timingSafeEqual(digest(value), digest(expected));
}

export function createTranscriberCookieValue(provider: TranscriberProvider = 'faster_whisper') {
  const scope =
    provider === 'faster_whisper' ? 'transcriber-access-v1' : 'transcriber-access-v1:yandex';
  return `v1.${digest(scope).toString('base64url')}`;
}

export function verifyTranscriberCookie(
  value: string | undefined,
  provider: TranscriberProvider = 'faster_whisper',
) {
  if (!value || !transcriberIsConfigured(provider)) return false;
  const expected = createTranscriberCookieValue(provider);
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
