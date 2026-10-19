/**
 * 로그인 상태 (Google 로그인). 세션 토큰은 이 브라우저에 저장하고 API 요청의 Authorization 헤더로 보낸다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../../shared/types';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** 동기화 상태 (저장하지 않음) */
  sync: SyncStatus;
  syncError: string | null;
  lastSyncedAt: number | null;
  setSession: (token: string, user: AuthUser) => void;
  clear: () => void;
  setSync: (sync: SyncStatus, error?: string | null) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      sync: 'idle',
      syncError: null,
      lastSyncedAt: null,
      setSession: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null, sync: 'idle', syncError: null }),
      setSync: (sync, error = null) => set((s) => ({ sync, syncError: error, lastSyncedAt: sync === 'idle' && !error ? Date.now() : s.lastSyncedAt })),
    }),
    {
      name: 'om-auth',
      version: 1,
      partialize: (s) => ({ token: s.token, user: s.user, lastSyncedAt: s.lastSyncedAt }),
    },
  ),
);
