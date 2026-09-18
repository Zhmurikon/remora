import { randomBytes } from 'node:crypto';
import { log } from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';

// Создаём секреты только один раз и никогда не печатаем их в журнал.
const secret = () => randomBytes(32).toString('hex');
const password = secret();
const content = readFileSync('/workspace/deploy/.env.example', 'utf8')
  .replaceAll('replace-with-random-secret@postgres', `${password}@postgres`)
  .replace('POSTGRES_PASSWORD=replace-with-random-secret', `POSTGRES_PASSWORD=${password}`)
  .replace('replace-with-at-least-32-random-characters', secret())
  .replaceAll('replace-with-random-secret', () => secret());
writeFileSync('/workspace/deploy/.env', content, { mode: 0o600, flag: 'wx' });
log('Создан deploy/.env; секреты не выводятся.');
