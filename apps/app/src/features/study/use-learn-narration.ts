import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../auth/auth-store';

export interface SpokenSide {
  text: string;
  lang?: string | null;
}

export function useLearnNarration() {
  const userId = useAuthStore((state) => state.user?.id);
  const supported =
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined';
  const entitlements = useQuery({
    queryKey: ['billing-entitlements', userId],
    enabled: supported && !!userId,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/billing/entitlements');
      if (error || !data) throw new Error('Не удалось проверить доступ к озвучке');
      return data;
    },
  });
  const available = supported && entitlements.data?.features?.['study.learn_narration'] === true;
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    if (!active.current) return;
    active.current.onend = null;
    active.current.onerror = null;
    active.current = null;
    window.speechSynthesis.cancel();
  }, []);
  const speak = useCallback(
    (...sides: SpokenSide[]) => {
      stop();
      if (!enabled || !available || document.hidden) return;
      const lines = sides.filter((side) => side.text.trim());
      function play(index: number) {
        const side = lines[index];
        if (!side) return;
        const utterance = new SpeechSynthesisUtterance(side.text);
        utterance.lang = side.lang || 'ru';
        active.current = utterance;
        utterance.onend = () => {
          if (active.current !== utterance) return;
          active.current = null;
          play(index + 1);
        };
        utterance.onerror = () => {
          if (active.current !== utterance) return;
          active.current = null;
          setFailed(true);
          setEnabled(false);
        };
        window.speechSynthesis.speak(utterance);
      }
      play(0);
    },
    [available, enabled, stop],
  );
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
    };
  }, [stop]);
  return {
    available,
    enabled: enabled && available,
    failed,
    speak,
    stop,
    toggle: () => {
      stop();
      setFailed(false);
      setEnabled(!enabled);
    },
  };
}
