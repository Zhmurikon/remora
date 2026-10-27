import { afterEach, describe, expect, it, vi } from 'vitest';

const keys = [
  'LEGAL_OPERATOR_NAME',
  'LEGAL_OPERATOR_INN',
  'LEGAL_OPERATOR_OGRNIP',
  'LEGAL_OPERATOR_ADDRESS',
  'LEGAL_PRIVACY_EMAIL',
] as const;

const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('реквизиты оператора', () => {
  it('считает готовым только полный набор реквизитов', async () => {
    process.env.LEGAL_OPERATOR_NAME = 'Индивидуальный предприниматель Тестов Тест Тестович';
    process.env.LEGAL_OPERATOR_INN = '123456789012';
    process.env.LEGAL_OPERATOR_OGRNIP = '123456789012345';
    process.env.LEGAL_OPERATOR_ADDRESS = 'г. Москва';
    process.env.LEGAL_PRIVACY_EMAIL = 'privacy@example.ru';

    const { legalDetailsReady } = await import('./legal-config');

    expect(legalDetailsReady).toBe(true);
  });

  it('отклоняет незаполненный ИНН', async () => {
    process.env.LEGAL_OPERATOR_NAME = 'Индивидуальный предприниматель Тестов Тест Тестович';
    process.env.LEGAL_OPERATOR_INN = 'replace-with-operator-inn';
    process.env.LEGAL_OPERATOR_OGRNIP = '123456789012345';
    process.env.LEGAL_OPERATOR_ADDRESS = 'г. Москва';
    process.env.LEGAL_PRIVACY_EMAIL = 'privacy@example.ru';

    const { legalDetailsReady } = await import('./legal-config');

    expect(legalDetailsReady).toBe(false);
  });
});
