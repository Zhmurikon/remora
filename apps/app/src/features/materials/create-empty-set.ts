import { api } from '../../lib/api';

export function createEmptySet() {
  return api.POST('/api/v1/sets', {
    body: {
      title: 'Новый набор',
      visibility: 'public',
      description: '',
      lang_term: 'ru',
      lang_definition: 'ru',
      folder_id: null,
    },
  });
}
