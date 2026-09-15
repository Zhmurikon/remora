import type { components } from '@remora/api-client';
import { create } from 'zustand';

export type User = components['schemas']['UserPublic'];
type AuthStatus = 'checking' | 'authenticated' | 'guest';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  authenticate: (user: User) => void;
  becomeGuest: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',
  user: null,
  authenticate: (user) => set({ status: 'authenticated', user }),
  becomeGuest: () => set({ status: 'guest', user: null }),
}));
