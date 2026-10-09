import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../../shared/types';
import { api } from '../lib/api';
import { shuffleArray, uid } from '../lib/format';
import type { Engine, EngineState } from '../player/engine';
import { useLibrary } from './library';
import { toast } from './ui';

export interface QueueItem {
  uid: string;
  track: Track;
  /** 자동재생(비슷한 음악)으로 추가된 항목 */
  auto?: boolean;
}

export type Repeat = 'off' | 'all' | 'one';
export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended';

export interface PlaySource {
  title: string;
  /** 앱 내부 경로 (재생 중인 출처 클릭 시 이동) */
  path?: string;
}

interface PlayerState {
  queue: QueueItem[];
  index: number;
  source: PlaySource | null;
  shuffle: boolean;
  /** 셔플 전 순서(uid) — 셔플 해제 시 복원 */
  originalOrder: string[] | null;
  repeat: Repeat;
  autoplay: boolean;
  status: Status;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  radioLoading: boolean;

  current: () => QueueItem | undefined;
  playTracks: (tracks: Track[], startIndex?: number, source?: PlaySource | null, opts?: { shuffle?: boolean; autoplay?: boolean }) => void;
  startRadio: (track: Track) => Promise<void>;
  playList: (playlistId: string, title: string, videoId?: string) => Promise<void>;
  playNext: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  removeFromQueue: (uid: string) => void;
  moveInQueue: (from: number, to: number) => void;
  jumpTo: (uid: string) => void;
  clearQueue: () => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setAutoplay: (on: boolean) => void;

  /* 엔진 → 스토어 */
  _onEngineState: (s: EngineState) => void;
  _onEngineError: (code: number) => void;
  _tick: () => void;
}

let engine: Engine | null = null;
let consecutiveErrors = 0;
/** 현재 곡을 실제로 재생 시작했는지 (기록 추가용) */
let countedUid: string | null = null;

export function attachEngine(e: Engine) {
  engine = e;
}

const toItems = (tracks: Track[], auto = false): QueueItem[] => tracks.map((track) => ({ uid: uid(), track, auto }));

const POSITION_KEY = 'om-position';

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      /** 현재 인덱스의 곡을 엔진에 로드 */
      const loadCurrent = (autoplay = true, start = 0) => {
        const item = get().queue[get().index];
        if (!item) {
          set({ status: 'idle', position: 0, duration: 0 });
          return;
        }
        countedUid = null;
        set({ status: autoplay ? 'loading' : 'paused', position: start, duration: item.track.duration ?? 0 });
        engine?.load(item.track.videoId, { autoplay, start, durationHint: item.track.duration });
        if (autoplay) maybeExtendWithRadio();
      };

      /** 큐의 마지막 곡에 도달하면 자동재생으로 비슷한 음악을 덧붙인다 */
      const maybeExtendWithRadio = async () => {
        const s = get();
        if (!s.autoplay || s.repeat === 'all' || s.radioLoading) return;
        if (s.index < s.queue.length - 1) return;
        const seed = s.queue[s.index]?.track;
        if (!seed) return;
        set({ radioLoading: true });
        try {
          const res = await api.upNext(seed.videoId);
          const existing = new Set(get().queue.map((q) => q.track.videoId));
          const fresh = res.tracks.filter((t) => !existing.has(t.videoId)).slice(0, 25);
          if (fresh.length) set((st) => ({ queue: [...st.queue, ...toItems(fresh, true)] }));
        } catch {
          /* 자동재생 실패는 조용히 무시 */
        } finally {
          set({ radioLoading: false });
        }
      };

      const goTo = (index: number, autoplay = true) => {
        set({ index });
        loadCurrent(autoplay);
      };

      return {
        queue: [],
        index: 0,
        source: null,
        shuffle: false,
        originalOrder: null,
        repeat: 'off',
        autoplay: true,
        status: 'idle',
        position: 0,
        duration: 0,
        volume: 100,
        muted: false,
        radioLoading: false,

        current: () => get().queue[get().index],

        playTracks: (tracks, startIndex = 0, source = null, opts = {}) => {
          if (!tracks.length) return;
          let items = toItems(tracks);
          let index = Math.min(Math.max(0, startIndex), items.length - 1);
          let originalOrder: string[] | null = null;
          if (opts.shuffle) {
            originalOrder = items.map((i) => i.uid);
            items = shuffleArray(items);
            index = 0;
          }
          consecutiveErrors = 0;
          set({ queue: items, index, source, shuffle: !!opts.shuffle, originalOrder });
          loadCurrent(opts.autoplay ?? true);
        },

        startRadio: async (track) => {
          const source = { title: `${track.title} 뮤직 스테이션` };
          get().playTracks([track], 0, source);
          try {
            const res = await api.upNext(track.videoId);
            const rest = res.tracks.filter((t) => t.videoId !== track.videoId);
            // 그 사이 다른 곡을 재생했다면 덧붙이지 않는다
            if (get().source !== source) return;
            set((s) => ({ queue: [...s.queue, ...toItems(rest)] }));
          } catch (err) {
            toast(`뮤직 스테이션을 불러오지 못했습니다. ${(err as Error).message}`);
          }
        },

        playList: async (playlistId, title, videoId) => {
          try {
            const res = await api.upNext(videoId, playlistId);
            if (!res.tracks.length) throw new Error('재생할 곡이 없습니다.');
            get().playTracks(res.tracks, 0, { title: res.title || title });
          } catch (err) {
            toast(`재생할 수 없습니다. ${(err as Error).message}`);
          }
        },

        playNext: (tracks) => {
          if (!tracks.length) return;
          const s = get();
          if (!s.queue.length) return get().playTracks(tracks);
          const items = toItems(tracks);
          const queue = [...s.queue.slice(0, s.index + 1), ...items, ...s.queue.slice(s.index + 1)];
          set({
            queue,
            originalOrder: s.originalOrder ? [...s.originalOrder, ...items.map((i) => i.uid)] : null,
          });
          toast(tracks.length > 1 ? `${tracks.length}곡을 다음에 재생합니다` : '다음 곡으로 재생됩니다');
        },

        addToQueue: (tracks) => {
          if (!tracks.length) return;
          const s = get();
          if (!s.queue.length) return get().playTracks(tracks);
          const items = toItems(tracks);
          // 자동재생 항목보다 앞(사용자 큐의 끝)에 넣는다
          let insertAt = s.queue.length;
          while (insertAt > s.index + 1 && s.queue[insertAt - 1].auto) insertAt--;
          const queue = [...s.queue.slice(0, insertAt), ...items, ...s.queue.slice(insertAt)];
          set({
            queue,
            originalOrder: s.originalOrder ? [...s.originalOrder, ...items.map((i) => i.uid)] : null,
          });
          toast(tracks.length > 1 ? `${tracks.length}곡을 현재 재생목록에 추가했습니다` : '현재 재생목록에 추가되었습니다');
        },

        removeFromQueue: (id) => {
          const s = get();
          const i = s.queue.findIndex((q) => q.uid === id);
          if (i < 0) return;
          const queue = s.queue.filter((q) => q.uid !== id);
          const originalOrder = s.originalOrder?.filter((u) => u !== id) ?? null;
          if (i < s.index) {
            set({ queue, index: s.index - 1, originalOrder });
          } else if (i === s.index) {
            if (!queue.length) {
              engine?.pause();
              set({ queue, index: 0, originalOrder, status: 'idle', position: 0, duration: 0 });
              return;
            }
            const index = Math.min(i, queue.length - 1);
            const wasPlaying = s.status === 'playing' || s.status === 'loading' || s.status === 'buffering';
            set({ queue, index, originalOrder });
            loadCurrent(wasPlaying);
          } else {
            set({ queue, originalOrder });
          }
        },

        moveInQueue: (from, to) => {
          const s = get();
          if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return;
          const currentUid = s.queue[s.index]?.uid;
          const queue = s.queue.slice();
          const [moved] = queue.splice(from, 1);
          // 사용자가 직접 옮긴 자동재생 항목은 일반 항목으로 취급
          queue.splice(to, 0, { ...moved, auto: false });
          set({ queue, index: Math.max(0, queue.findIndex((q) => q.uid === currentUid)) });
        },

        jumpTo: (id) => {
          const i = get().queue.findIndex((q) => q.uid === id);
          if (i < 0) return;
          if (i === get().index) return get().togglePlay();
          consecutiveErrors = 0;
          goTo(i);
        },

        clearQueue: () => {
          engine?.pause();
          set({ queue: [], index: 0, status: 'idle', position: 0, duration: 0, source: null, originalOrder: null, shuffle: false });
        },

        togglePlay: () => {
          const s = get();
          if (!s.queue.length) return;
          if (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading') get().pause();
          else get().play();
        },

        play: () => {
          const s = get();
          if (!s.queue.length) return;
          if (s.status === 'idle' || s.status === 'ended') {
            // 새로고침 후 복원된 상태이거나 끝난 상태 → 다시 로드
            loadCurrent(true, s.status === 'ended' ? 0 : s.position);
            return;
          }
          engine?.play();
        },

        pause: () => engine?.pause(),

        next: () => {
          const s = get();
          if (!s.queue.length) return;
          consecutiveErrors = 0;
          if (s.index < s.queue.length - 1) return goTo(s.index + 1);
          if (s.repeat !== 'off') return goTo(0);
          toast('재생목록의 마지막 곡입니다');
        },

        prev: () => {
          const s = get();
          if (!s.queue.length) return;
          if (s.position > 3 || s.index === 0) {
            get().seek(0);
            if (s.status === 'ended' || s.status === 'idle') loadCurrent(true);
            return;
          }
          consecutiveErrors = 0;
          goTo(s.index - 1);
        },

        seek: (seconds) => {
          const d = get().duration;
          const t = Math.max(0, d ? Math.min(seconds, d - 0.5) : seconds);
          set({ position: t });
          if (get().status === 'idle') {
            loadCurrent(false, t);
            return;
          }
          engine?.seek(t);
        },

        seekBy: (delta) => get().seek(get().position + delta),

        setVolume: (v) => {
          const volume = Math.round(Math.min(100, Math.max(0, v)));
          set({ volume, muted: volume === 0 });
          engine?.setVolume(volume);
          engine?.setMuted(volume === 0);
        },

        toggleMute: () => {
          const s = get();
          const muted = !s.muted;
          const volume = !muted && s.volume === 0 ? 50 : s.volume;
          set({ muted, volume });
          engine?.setVolume(volume);
          engine?.setMuted(muted);
        },

        cycleRepeat: () => {
          const order: Repeat[] = ['off', 'all', 'one'];
          const repeat = order[(order.indexOf(get().repeat) + 1) % order.length];
          set({ repeat });
          toast(repeat === 'off' ? '반복 사용 안함' : repeat === 'all' ? '모두 반복' : '한 곡 반복');
        },

        toggleShuffle: () => {
          const s = get();
          if (!s.queue.length) {
            set({ shuffle: !s.shuffle });
            return;
          }
          const current = s.queue[s.index];
          if (!s.shuffle) {
            const before = s.queue.slice(0, s.index + 1);
            const after = shuffleArray(s.queue.slice(s.index + 1));
            set({ shuffle: true, originalOrder: s.queue.map((q) => q.uid), queue: [...before, ...after] });
          } else {
            const byUid = new Map(s.queue.map((q) => [q.uid, q]));
            const restored: QueueItem[] = [];
            for (const id of s.originalOrder ?? []) {
              const item = byUid.get(id);
              if (item) {
                restored.push(item);
                byUid.delete(id);
              }
            }
            restored.push(...byUid.values());
            set({
              shuffle: false,
              originalOrder: null,
              queue: restored,
              index: Math.max(0, restored.findIndex((q) => q.uid === current?.uid)),
            });
          }
        },

        setAutoplay: (on) => {
          set({ autoplay: on });
          if (on) maybeExtendWithRadio();
          else set((s) => ({ queue: s.queue.filter((q, i) => !q.auto || i <= s.index) }));
        },

        _onEngineState: (state) => {
          switch (state) {
            case 'playing': {
              consecutiveErrors = 0;
              const d = engine?.getDuration() ?? 0;
              set({ status: 'playing', ...(d > 0 ? { duration: d } : {}) });
              const item = get().current();
              if (item && countedUid !== item.uid) {
                countedUid = item.uid;
                useLibrary.getState().addHistory(item.track);
              }
              break;
            }
            case 'paused':
              set({ status: 'paused' });
              break;
            case 'buffering':
              set({ status: 'buffering' });
              break;
            case 'cued':
              if (get().status === 'loading') set({ status: 'paused' });
              break;
            case 'ended': {
              const s = get();
              if (s.repeat === 'one') {
                engine?.seek(0);
                engine?.play();
                return;
              }
              if (s.index < s.queue.length - 1) return goTo(s.index + 1);
              if (s.repeat === 'all') return goTo(0);
              set({ status: 'ended', position: s.duration });
              break;
            }
            default:
              break;
          }
        },

        _onEngineError: (code) => {
          const s = get();
          const item = s.current();
          const reason =
            code === 101 || code === 150 || code === 153
              ? '소유자가 다른 웹사이트에서의 재생을 허용하지 않은 곡입니다'
              : code === 100
                ? '삭제되었거나 비공개인 곡입니다'
                : '재생할 수 없는 곡입니다';
          toast(`${item ? `'${item.track.title}': ` : ''}${reason}`);
          consecutiveErrors++;
          if (consecutiveErrors >= Math.min(8, s.queue.length)) {
            set({ status: 'paused' });
            toast('연속으로 재생할 수 없는 곡이 많아 재생을 멈췄습니다');
            return;
          }
          if (s.index < s.queue.length - 1) setTimeout(() => goTo(get().index + 1), 600);
          else if (s.repeat === 'all') setTimeout(() => goTo(0), 600);
          else set({ status: 'paused' });
        },

        _tick: () => {
          if (!engine) return;
          const s = get();
          if (s.status !== 'playing' && s.status !== 'buffering') return;
          const position = engine.getTime();
          const d = engine.getDuration();
          set({ position, ...(d > 0 && Math.abs(d - s.duration) > 0.5 ? { duration: d } : {}) });
        },
      };
    },
    {
      name: 'om-player',
      version: 1,
      partialize: (s) => ({
        queue: s.queue.slice(0, 1000),
        index: s.index,
        source: s.source,
        shuffle: s.shuffle,
        originalOrder: s.originalOrder,
        repeat: s.repeat,
        autoplay: s.autoplay,
        volume: s.volume,
        muted: s.muted,
        duration: s.duration,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        try {
          state.position = Number(localStorage.getItem(POSITION_KEY)) || 0;
        } catch {
          /* noop */
        }
        state.status = 'idle';
      },
    },
  ),
);

/** 재생 위치는 자주 바뀌므로 별도 키에 가끔 저장한다 */
let lastSaved = 0;
usePlayer.subscribe((s) => {
  const now = Date.now();
  if (now - lastSaved < 3000) return;
  lastSaved = now;
  try {
    localStorage.setItem(POSITION_KEY, String(Math.floor(s.position)));
  } catch {
    /* noop */
  }
});

export const player = () => usePlayer.getState();
