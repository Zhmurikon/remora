import { useAuthStore } from '../auth/auth-store';

export interface PythonProgressScope {
  readonly userId: string | null;
  readonly session: number;
  readonly storage: Storage | null;
}

let session = 0;
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.status !== previous.status) session += 1;
});

export function capturePythonProgressScope(storage = browserStorage()): PythonProgressScope {
  const auth = useAuthStore.getState();
  return {
    userId: auth.status === 'authenticated' ? (auth.user?.id ?? null) : null,
    session,
    storage,
  };
}

export function isPythonScopeCurrent(scope: PythonProgressScope): boolean {
  const auth = useAuthStore.getState();
  return (
    scope.userId !== null &&
    scope.session === session &&
    auth.status === 'authenticated' &&
    auth.user?.id === scope.userId
  );
}

export function pythonStorageKey(scope: PythonProgressScope, suffix: string): string {
  // Старые ключи без владельца остаются нетронутыми: их нельзя приписать текущему аккаунту.
  return `remora.practice.python.user:${encodeURIComponent(scope.userId ?? '')}:${suffix}`;
}

export function pythonScopeRequest(scope: PythonProgressScope) {
  const controller = new AbortController();
  const check = () => {
    if (!isPythonScopeCurrent(scope)) controller.abort();
  };
  const dispose = useAuthStore.subscribe(check);
  check();
  return { signal: controller.signal, dispose };
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
