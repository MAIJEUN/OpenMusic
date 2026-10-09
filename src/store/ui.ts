import type { ReactNode } from 'react';
import type { Track } from '../../shared/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  action?: () => void;
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  /** 기준 요소의 사각형 (버튼 아래에 붙이기 위함) */
  anchor?: { top: number; bottom: number; left: number; right: number };
  items: (MenuItem | 'divider')[];
}

export type NowPlayingTab = 'upnext' | 'lyrics';

export interface PlaybackSettings {
  /** 크로스페이드 길이(초). 0이면 끔 */
  crossfade: number;
  /** SponsorBlock 데이터로 뮤직비디오의 노래가 아닌 구간 건너뛰기 */
  skipNonMusic: boolean;
  /** 실시간 스펙트럼이 켜져 있을 때 곡 끝의 무음 건너뛰기 */
  skipSilence: boolean;
}

export type Dialog =
  | { type: 'addLink' }
  | { type: 'settings' }
  /** 곡들을 내 재생목록에 저장 (기존 재생목록 선택 또는 새로 만들기) */
  | { type: 'saveTo'; tracks: Track[]; suggestedTitle?: string }
  /** 새 재생목록 만들기 (곡을 같이 넣을 수도 있음) */
  | { type: 'newPlaylist'; tracks?: Track[]; suggestedTitle?: string }
  | { type: 'rename'; playlistId: string }
  /** 내 재생목록 삭제 확인 (삭제 후 afterDelete 실행) */
  | { type: 'confirmDelete'; playlistId: string; afterDelete?: () => void };

interface UiState {
  sidebarCollapsed: boolean;
  /** 재생 설정 */
  playback: PlaybackSettings;
  setPlayback: (patch: Partial<PlaybackSettings>) => void;
  nowPlayingOpen: boolean;
  npTab: NowPlayingTab;
  npMode: 'song' | 'video';
  toasts: Toast[];
  menu: MenuState | null;
  dialog: Dialog | null;
  videoSlot: HTMLElement | null;

  toggleSidebar: () => void;
  setNowPlaying: (open: boolean) => void;
  setNpTab: (tab: NowPlayingTab) => void;
  setNpMode: (mode: 'song' | 'video') => void;
  toast: (text: string, opts?: { actionLabel?: string; action?: () => void }) => void;
  dismissToast: (id: number) => void;
  openMenu: (menu: MenuState) => void;
  closeMenu: () => void;
  setDialog: (d: UiState['dialog']) => void;
  setVideoSlot: (el: HTMLElement | null) => void;
}

let toastId = 0;

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      playback: { crossfade: 5, skipNonMusic: true, skipSilence: true },
      setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),
      nowPlayingOpen: false,
      npTab: 'upnext',
      npMode: 'song',
      toasts: [],
      menu: null,
      dialog: null,
      videoSlot: null,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setNowPlaying: (open) => set({ nowPlayingOpen: open }),
      setNpTab: (tab) => set({ npTab: tab }),
      setNpMode: (mode) => set({ npMode: mode }),
      toast: (text, opts) => {
        const id = ++toastId;
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, ...opts }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      openMenu: (menu) => set({ menu }),
      closeMenu: () => set({ menu: null }),
      setDialog: (dialog) => set({ dialog }),
      setVideoSlot: (videoSlot) => set({ videoSlot }),
    }),
    {
      name: 'om-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, npMode: s.npMode, playback: s.playback }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return { ...current, ...p, playback: { ...current.playback, ...(p.playback ?? {}) } };
      },
    },
  ),
);

export const toast = (text: string, opts?: { actionLabel?: string; action?: () => void }) =>
  useUi.getState().toast(text, opts);
