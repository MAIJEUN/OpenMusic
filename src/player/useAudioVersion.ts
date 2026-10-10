import { useEffect } from 'react';
import type { Counterpart, Track } from '../../shared/types';
import { api } from '../lib/api';
import { setSourceResolver, usePlayer } from '../store/player';
import { useUi } from '../store/ui';

/**
 * YouTube Music처럼 '노래'를 고르면 노래(음원) 버전, '동영상'을 고르면 뮤직비디오를 튼다.
 * 곡마다 짝이 되는 다른 버전과 두 영상의 시간 대응을 받아 두고, 재생할 영상을 바꿔 끼운다.
 */

const cache = new Map<string, Counterpart | null>();
const pending = new Map<string, Promise<Counterpart | null>>();

function fetchCounterpart(videoId: string): Promise<Counterpart | null> {
  if (cache.has(videoId)) return Promise.resolve(cache.get(videoId)!);
  let p = pending.get(videoId);
  if (!p) {
    p = api
      .counterpart(videoId)
      .catch(() => null)
      .then((cp) => {
        cache.set(videoId, cp);
        pending.delete(videoId);
        return cp;
      });
    pending.set(videoId, p);
  }
  return p;
}

/** 이미 받아 둔 짝 정보 (없으면 undefined) */
export const cachedCounterpart = (videoId: string) => cache.get(videoId);
export { fetchCounterpart };

/** 지금 설정(노래/동영상)에 맞는 영상 */
function pick(track: Track, cp: Counterpart | null | undefined) {
  const want = useUi.getState().npMode === 'song' ? 'song' : 'video';
  if (cp && cp.self !== want && cp.other.kind === want) return { videoId: cp.other.videoId, duration: cp.other.duration };
  return { videoId: track.videoId, duration: track.duration };
}

/** 시간 대응표로 한 영상의 위치를 다른 영상의 위치로 바꾼다 (from: 원래 곡 기준인지) */
export function mapTime(cp: Counterpart, t: number, fromSelf: boolean): number {
  const segs = cp.segments;
  if (!segs.length) return t;
  for (const g of segs) {
    const a = fromSelf ? g.self : g.other;
    const b = fromSelf ? g.other : g.self;
    if (t >= a && t < a + g.duration) return b + (t - a);
  }
  // 대응 구간 밖(인트로·아웃트로)이면 가장 가까운 구간 기준으로 옮긴다
  const first = segs[0];
  const a = fromSelf ? first.self : first.other;
  const b = fromSelf ? first.other : first.self;
  return Math.max(0, b + (t - a));
}

export function useAudioVersion() {
  useEffect(() => {
    setSourceResolver((track) => pick(track, cache.get(track.videoId)));

    let running = 0;
    const sync = async () => {
      const id = ++running;
      const s = usePlayer.getState();
      const item = s.queue[s.index];
      if (!item) return;
      // 다음 곡 짝도 미리 받아 두면 곡이 넘어갈 때 바로 맞는 버전이 나온다
      const nextItem = s.queue[s.index + 1];
      if (nextItem) void fetchCounterpart(nextItem.track.videoId);

      const cp = await fetchCounterpart(item.track.videoId);
      if (id !== running) return;
      const now = usePlayer.getState();
      if (now.queue[now.index]?.uid !== item.uid || !now.playingId) return;
      const target = pick(item.track, cp);
      if (target.videoId === now.playingId || !cp) return;
      // 지금 재생 위치를 새 영상의 같은 부분으로 옮긴다
      const fromSelf = now.playingId === item.track.videoId;
      now.switchSource(target.videoId, target.duration, (t) => mapTime(cp, t, fromSelf));
    };

    let lastUid: string | undefined;
    let hadPlaying = false;
    const unsubPlayer = usePlayer.subscribe((s) => {
      const uid = s.queue[s.index]?.uid;
      // 곡이 바뀌었거나, 새로고침 후 처음으로 영상이 준비됐을 때
      if (uid !== lastUid || (!!s.playingId && !hadPlaying)) {
        lastUid = uid;
        void sync();
      }
      hadPlaying = !!s.playingId;
    });
    const unsubUi = useUi.subscribe((s, prev) => {
      if (s.npMode !== prev.npMode) void sync();
    });
    void sync();
    return () => {
      unsubPlayer();
      unsubUi();
    };
  }, []);
}
