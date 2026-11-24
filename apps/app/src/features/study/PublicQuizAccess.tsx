import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../lib/api';
import { setDetailQuery } from '../materials/set-queries';
import { StudyState } from './StudyShell';

export function PublicQuizAccess({ setId, children }: { setId: string; children: ReactNode }) {
  const cache = useQueryClient();
  const access = useQuery({ ...setDetailQuery(setId), retry: false });
  const problem = access.error?.cause;
  const needsSave =
    typeof problem === 'object' &&
    problem !== null &&
    'code' in problem &&
    problem.code === 'FORBIDDEN';
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/library', {
        body: { target_type: 'set', target_id: setId, text_only: false },
      });
      if (error || !data)
        throw new Error(
          (error as { message?: string })?.message ?? 'Не удалось сохранить карточки.',
        );
    },
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ['library'] }), access.refetch()]);
    },
  });
  if (access.isPending) return <StudyState title="Открываем квиз урока" loading />;
  if (access.isError && !needsSave)
    return (
      <StudyState
        title="Не удалось открыть карточки урока"
        error
        actions={<Button onClick={() => void access.refetch()}>Повторить загрузку</Button>}
      />
    );
  if (!needsSave && access.data) return children;
  return (
    <StudyState
      title="Карточки урока"
      actions={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить карточки и открыть квиз
        </Button>
      }
    >
      <p>Чтобы пройти квиз и сохранить результат, добавьте карточки урока в свою библиотеку.</p>
      {save.isError && (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      )}
    </StudyState>
  );
}
