import { afterEach, describe, expect, it } from 'vitest';
import {
  createTranscriberCookieValue,
  transcriberIsConfigured,
  verifyTranscriberCode,
  verifyTranscriberCookie,
} from './transcriber-auth';

const original = {
  secret: process.env.SECRET_KEY,
  code: process.env.TRANSCRIBER_ACCESS_CODE,
  apiKey: process.env.FASTER_WHISPER_API_KEY,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    SECRET_KEY: original.secret,
    TRANSCRIBER_ACCESS_CODE: original.code,
    FASTER_WHISPER_API_KEY: original.apiKey,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('доступ к расшифровке', () => {
  it('не включается без полной серверной настройки', () => {
    delete process.env.FASTER_WHISPER_API_KEY;
    expect(transcriberIsConfigured()).toBe(false);
    expect(verifyTranscriberCookie('любой-токен')).toBe(false);
  });

  it('принимает только верный код и подписанную cookie', () => {
    process.env.SECRET_KEY = 'test-secret-key-with-at-least-32-characters';
    process.env.TRANSCRIBER_ACCESS_CODE = '1448';
    process.env.FASTER_WHISPER_API_KEY = 'test-api-key';

    expect(verifyTranscriberCode('1448')).toBe(true);
    expect(verifyTranscriberCode('1449')).toBe(false);
    expect(verifyTranscriberCookie(createTranscriberCookieValue())).toBe(true);
    expect(verifyTranscriberCookie('v1.forged')).toBe(false);
  });
});
