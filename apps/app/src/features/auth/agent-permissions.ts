import type { components } from '@remora/api-client';

export type Scope = components['schemas']['ApiTokenCreate']['scopes'][number];
export const permissions: { value: Scope; label: string; adminOnly?: boolean }[] = [
  { value: 'materials:read', label: 'Читать свои наборы и курсы' },
  { value: 'materials:write', label: 'Создавать и изменять материалы' },
  { value: 'courses:publish', label: 'Публиковать курсы и снимать с публикации' },
  { value: 'blog:read', label: 'Читать редакционные черновики', adminOnly: true },
  { value: 'blog:write', label: 'Создавать и изменять статьи блога', adminOnly: true },
  { value: 'blog:publish', label: 'Публиковать статьи и снимать их с публикации', adminOnly: true },
];
