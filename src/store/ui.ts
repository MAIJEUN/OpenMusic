import type { ReactNode } from 'react';
import type { OriginalSong, Track } from '../../shared/types';
import type { CollectionInfo } from './library';
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
  /** 이 시간(초) 이상 무음이 이어지면 다음 곡으로 */
  silenceSeconds: number;
  /** 볼륨 균형 조정 (곡마다 다른 음량을 맞춘다). 예전 설정에는 없어서 비어 있으면 'normal' */
  normalize?: 'off' | 'normal' | 'strong';
}

export interface LyricsOverride {
  hidden?: boolean;
  original?: OriginalSong;
}

/** 링크로 가져온 재생목록에 하려던 수정 (복사본에 그대로 적용한다) */
export type LinkedEdit =
  | { type: 'remove'; videoId: string; title: string }
  | { type: 'move'; videoId: string; targetVideoId: string; title: string }
  | { type: 'rename' };

export type Dialog =
  | { type: 'addLink' }
  | { type: 'login' }
  /**
   * 링크로 가져온 재생목록을 내 재생목록으로 복사.
   * edit가 있으면 '링크로 가져온 재생목록은 수정할 수 없어요' 안내와 함께 띄우고, 복사본에 그 수정을 바로 적용한다
   */
  | { type: 'copyLinked'; collection: CollectionInfo; getTracks: () => Promise<Track[]>; edit?: LinkedEdit }
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
  /** 재생 설정을 마지막으로 바꾼 시각 (로그인 동기화에서 더 나중 것을 쓰기 위해) */
  playbackAt: number;
  setPlayback: (patch: Partial<PlaybackSettings>) => void;
  /** 곡별 가사 설정(싱크·원곡·숨기기)을 마지막으로 바꾼 시각 */
  lyricsAt: Record<string, number>;
  /** 동기화로 받은 설정을 반영한다 */
  applySynced: (p: Pick<UiState, 'playback' | 'playbackAt' | 'lyricsOffsets' | 'lyricsOverrides' | 'lyricsAt'>) => void;
  /** 곡(영상 ID)별로 직접 맞춘 가사 싱크(초) */
  lyricsOffsets: Record<string, number>;
  /** 영상별 가사 설정: 숨기기, 직접 고른 원곡 */
  lyricsOverrides: Record<string, LyricsOverride>;
  setLyricsOverride: (videoId: string, o: LyricsOverride | null) => void;
  setLyricsOffset: (videoId: string, seconds: number) => void;
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

/** 곡별 가사 설정을 바꾼 시각 기록 (오래된 것부터 지워 너무 커지지 않게) */
function touch(at: Record<string, number>, videoId: string): Record<string, number> {
  const next = { ...at };
  delete next[videoId];
  next[videoId] = Date.now();
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - 1500))) delete next[k];
  return next;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      playback: { crossfade: 5, skipNonMusic: true, skipSilence: true, silenceSeconds: 3, normalize: 'normal' },
      playbackAt: 0,
      setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch }, playbackAt: Date.now() })),
      lyricsOffsets: {},
      lyricsOverrides: {},
      lyricsAt: {},
      applySynced: (p) => set(p),
      setLyricsOverride: (videoId, o) =>
        set((s) => {
          const next = { ...s.lyricsOverrides };
          delete next[videoId];
          if (o) next[videoId] = o;
          const keys = Object.keys(next);
          for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete next[k];
          return { lyricsOverrides: next, lyricsAt: touch(s.lyricsAt, videoId) };
        }),
      setLyricsOffset: (videoId, seconds) =>
        set((s) => {
          const next = { ...s.lyricsOffsets };
          delete next[videoId];
          if (seconds !== 0) next[videoId] = seconds;
          // 오래된 것부터 지워 너무 커지지 않게
          const keys = Object.keys(next);
          for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete next[k];
          return { lyricsOffsets: next, lyricsAt: touch(s.lyricsAt, videoId) };
        }),
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
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        npMode: s.npMode,
        playback: s.playback,
        playbackAt: s.playbackAt,
        lyricsOffsets: s.lyricsOffsets,
        lyricsOverrides: s.lyricsOverrides,
        lyricsAt: s.lyricsAt,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return { ...current, ...p, playback: { ...current.playback, ...(p.playback ?? {}) } };
      },
    },
  ),
);

export const toast = (text: string, opts?: { actionLabel?: string; action?: () => void }) =>
  useUi.getState().toast(text, opts);
