#!/usr/bin/env node
/**
 * Генерирует TypeScript-типы API из OpenAPI-схемы FastAPI.
 *
 *   pnpm gen:api
 *
 * Схема берётся прямо из объекта FastAPI (apps/api/scripts/dump_openapi.py),
 * поэтому запущенный сервер не нужен и генерация воспроизводима в CI.
 *
 * Результат: packages/api-client/src/generated/schema.ts — коммитится в репозиторий,
 * иначе сборка фронтендов падает на чистом клоне.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, 'apps/api');
const schemaFile = resolve(apiDir, 'openapi.json');
const outFile = resolve(root, 'packages/api-client/src/generated/schema.ts');

console.log('Собираю OpenAPI-схему из apps/api…');

let schema;
try {
  schema = execFileSync('uv', ['run', 'python', 'scripts/dump_openapi.py'], {
    cwd: apiDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  console.error('Не удалось собрать схему.');
  console.error(err.stderr?.toString() ?? err.message);
  process.exit(1);
}

await writeFile(schemaFile, schema, 'utf8');

const types = execFileSync(
  'pnpm',
  ['--filter', '@remora/api-client', 'exec', 'openapi-typescript', schemaFile],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const header = `/* eslint-disable */
/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не редактировать руками.
 * Источник: OpenAPI-схема apps/api. Обновить: pnpm gen:api
 */
`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, header + types, 'utf8');
console.log(`Готово: ${outFile}`);
