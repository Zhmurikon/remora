import { useCallback, useEffect, useRef } from 'react';
import { rewardFinished } from './rewards/playback';

/** Время на чтение и движение частиц могут отличаться у каждого ответа. */
export function useStudyTransition() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const cancel = useCallback(() => {
    sequence.current++;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const schedule = useCallback(
    (action: () => void, delay = 0, hold = 0) => {
      cancel();
      const scheduled = sequence.current;
      timer.current = setTimeout(async () => {
        await rewardFinished(bodyRef.current);
        if (scheduled !== sequence.current) return;
        if (hold) timer.current = setTimeout(action, hold);
        else action();
      }, delay);
    },
    [cancel],
  );
  return { schedule, cancel, bodyRef };
}
