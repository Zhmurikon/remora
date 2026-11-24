import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function setDetailQuery(setId: string) {
  return queryOptions({
    queryKey: ['sets', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets/{set_id}', {
        params: { path: { set_id: setId } },
      });
      if (!data || error) throw new Error('Не удалось загрузить набор.', { cause: error });
      return data;
    },
  });
}

export function setStatsQuery(setId: string) {
  return queryOptions({
    queryKey: ['study', 'set-stats', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/sets/{set_id}/stats', {
        params: { path: { set_id: setId } },
      });
      if (!data || error) throw new Error('Не удалось загрузить прогресс.');
      return data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
