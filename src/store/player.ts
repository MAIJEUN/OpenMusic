import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../../shared/types';
import { shuffleArray, uid } from '../lib/format';
import type { Engine, EngineState } from '../player/engine';
import { toast } from './ui';

export interface QueueItem {
  uid: string;
  track: Track;
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
  /** 셔플 모드 (재생목록을 바꿔도 유지된다) */
  /** 셔플 전 순서(uid) — 셔플 해제 시 복원 */
  originalOrder: string[] | null;
  repeat: Repeat;
  status: Status;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;

  current: () => QueueItem | undefined;
  /**
   * 대기열을 새로 만들고 재생한다.
   * - opts.shuffle: true면 셔플 모드를 켠다 (생략하면 현재 셔플 모드를 따른다)
   * - opts.randomStart: 셔플 중일 때 첫 곡도 무작위로 고른다 (재생/셔플 버튼). 없으면 startIndex 곡이 먼저 재생된다.
   */
  playTracks: (
    tracks: Track[],
    startIndex?: number,
    source?: PlaySource | null,
    opts?: { shuffle?: boolean; randomStart?: boolean; autoplay?: boolean },
  ) => void;
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

  /* 엔진 → 스토어 */
  _onEngineState: (s: EngineState) => void;
  _onEngineError: (code: number) => void;
  _tick: () => void;
}

let engine: Engine | null = null;
let consecutiveErrors = 0;

/**
 * 탐색 처리.
 * YouTube 플레이어는 seekTo 직후 한동안 예전 재생 시간을 돌려주기 때문에,
 * 그 값을 그대로 쓰면 화면이 뒤로 튀고 연속 탐색(방향키 연타)이 예전 위치 기준으로 계산된다.
 * - 화면 위치는 목표 위치로 즉시 바꾸고
 * - 실제 seek는 연타가 멈춘 뒤 한 번만 보내며
 * - 플레이어가 목표 근처에 도착할 때까지(최대 2.5초) 플레이어가 주는 시간을 무시한다.
 */
let pendingSeek: { target: number; sentAt: number } | null = null;
let seekTimer: ReturnType<typeof setTimeout> | null = null;
const SEEK_DEBOUNCE_MS = 140;

function cancelPendingSeek() {
  if (seekTimer) clearTimeout(seekTimer);
  seekTimer = null;
  pendingSeek = null;
}

export function attachEngine(e: Engine) {
  engine = e;
}

const toItems = (tracks: Track[]): QueueItem[] => tracks.map((track) => ({ uid: uid(), track }));

/** first를 맨 앞에 두고 나머지를 무작위로 섞는다 */
function shuffleWithFirst(items: QueueItem[], first: QueueItem | undefined): QueueItem[] {
  if (!first) return shuffleArray(items);
  return [first, ...shuffleArray(items.filter((i) => i.uid !== first.uid))];
}

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
        cancelPendingSeek();
        set({ status: autoplay ? 'loading' : 'paused', position: start, duration: item.track.duration ?? 0 });
        engine?.load(item.track.videoId, { autoplay, start, durationHint: item.track.duration });
      };

      const goTo = (index: number, autoplay = true) => {
        set({ index });
        loadCurrent(autoplay);
      };

      /** 대기열 끝에서 '모두 반복'으로 처음으로 돌아갈 때. 셔플 중이면 새 순서로 다시 섞는다 */
      const wrapAround = () => {
        const s = get();
        if (s.shuffle && s.queue.length > 2) {
          const last = s.queue[s.queue.length - 1];
          let queue = shuffleArray(s.queue);
          // 방금 들은 곡이 바로 다시 나오지 않게
          if (queue[0].uid === last.uid) queue = [...queue.slice(1), queue[0]];
          set({ queue });
        }
        goTo(0);
      };

      return {
        queue: [],
        index: 0,
        source: null,
        shuffle: false,
        originalOrder: null,
        repeat: 'off',
        status: 'idle',
        position: 0,
        duration: 0,
        volume: 100,
        muted: false,

        current: () => get().queue[get().index],

        playTracks: (tracks, startIndex = 0, source = null, opts = {}) => {
          if (!tracks.length) return;
          let items = toItems(tracks);
          let index = Math.min(Math.max(0, startIndex), items.length - 1);
          const shuffle = opts.shuffle ?? get().shuffle;
          let originalOrder: string[] | null = null;
          if (shuffle) {
            originalOrder = items.map((i) => i.uid);
            items = shuffleWithFirst(items, opts.randomStart ? undefined : items[index]);
            index = 0;
          }
          consecutiveErrors = 0;
          set({ queue: items, index, source, shuffle, originalOrder });
          loadCurrent(opts.autoplay ?? true);
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
          const queue = [...s.queue, ...items];
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
          queue.splice(to, 0, moved);
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
          set({ queue: [], index: 0, status: 'idle', position: 0, duration: 0, source: null, originalOrder: null });
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
          if (s.repeat !== 'off') return wrapAround();
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
          pendingSeek = { target: t, sentAt: 0 };
          if (seekTimer) clearTimeout(seekTimer);
          seekTimer = setTimeout(() => {
            seekTimer = null;
            if (!pendingSeek) return;
            pendingSeek.sentAt = Date.now();
            engine?.seek(pendingSeek.target);
          }, SEEK_DEBOUNCE_MS);
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
            // 지금 곡을 맨 앞에 두고, 이미 들은 곡을 포함한 나머지 전체를 섞는다
            set({
              shuffle: true,
              originalOrder: s.queue.map((q) => q.uid),
              queue: shuffleWithFirst(s.queue, current),
              index: 0,
            });
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

        _onEngineState: (state) => {
          switch (state) {
            case 'playing': {
              consecutiveErrors = 0;
              const d = engine?.getDuration() ?? 0;
              set({ status: 'playing', ...(d > 0 ? { duration: d } : {}) });
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
              if (s.repeat === 'all') return wrapAround();
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
          else if (s.repeat === 'all') setTimeout(wrapAround, 600);
          else set({ status: 'paused' });
        },

        _tick: () => {
          if (!engine) return;
          const s = get();
          if (s.status !== 'playing' && s.status !== 'buffering') return;
          const position = engine.getTime();
          const d = engine.getDuration();
          const durationPatch = d > 0 && Math.abs(d - s.duration) > 0.5 ? { duration: d } : {};
          if (pendingSeek) {
            // 아직 seek를 보내기 전이거나, 플레이어가 목표 위치에 도착하기 전이면 화면 위치를 유지
            const arrived = pendingSeek.sentAt > 0 && Math.abs(position - pendingSeek.target) < 1.5;
            const timedOut = pendingSeek.sentAt > 0 && Date.now() - pendingSeek.sentAt > 2500;
            if (!arrived && !timedOut) {
              if (Object.keys(durationPatch).length) set(durationPatch);
              return;
            }
            pendingSeek = null;
          }
          set({ position, ...durationPatch });
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
