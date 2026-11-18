import { useCallback, useEffect, useRef } from 'react';

/** Отложенная смена вопроса не должна срабатывать после выхода из тренировки. */
export function useStudyTransition() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const schedule = useCallback(
    (action: () => void, delay: number) => {
      cancel();
      timer.current = setTimeout(action, delay);
    },
    [cancel],
  );
  return { schedule, cancel };
}
