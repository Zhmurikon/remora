import { useEffect, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from './auth-store';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const authenticate = useAuthStore((state) => state.authenticate);
  const becomeGuest = useAuthStore((state) => state.becomeGuest);

  useEffect(() => {
    const controller = new AbortController();
    void api.GET('/api/v1/auth/me', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (data) authenticate(data);
      else becomeGuest();
    });
    return () => controller.abort();
  }, [authenticate, becomeGuest]);

  return children;
}
