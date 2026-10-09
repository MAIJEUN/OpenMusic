import type { ReactNode } from 'react';
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

interface UiState {
  sidebarCollapsed: boolean;
  nowPlayingOpen: boolean;
  npTab: NowPlayingTab;
  npMode: 'song' | 'video';
  toasts: Toast[];
  menu: MenuState | null;
  dialog: 'addLink' | null;
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
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, npMode: s.npMode }),
    },
  ),
);

export const toast = (text: string, opts?: { actionLabel?: string; action?: () => void }) =>
  useUi.getState().toast(text, opts);
