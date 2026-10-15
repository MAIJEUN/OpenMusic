/**
 * 볼륨 균형 조정: 곡마다 녹음된 음량이 달라서 볼륨을 계속 만져야 하는 문제를 줄인다.
 *
 * - 곡 음량은 서버가 Deezer의 같은 곡 정보(평균 음량, 대략 LUFS)에서 가져온다.
 * - YouTube는 기준(약 -14 LUFS)보다 큰 곡만 줄여서 틀고, 작은 곡은 키우지 않는다.
 *   그래서 "실제로 들리는 음량" = min(곡 음량, -14) 이고, 그보다 큰 곡을 목표 음량까지 줄여서 맞춘다
 *   (볼륨을 키울 수는 없으므로 조용한 곡에 맞춰 나머지를 줄이는 방식).
 * - SoundCloud는 음량을 줄여 주지 않아서 업로드된 음량 그대로 들린다 (정보가 없으면 보통 큰 편으로 본다).
 * - 음량 정보가 없는 YouTube 곡은 기준 음량(-14)으로 들린다고 본다.
 */
import { useEffect } from 'react';
import type { Loudness, Track } from '../../shared/types';
import { isSoundCloudId } from '../../shared/links';
import { api } from '../lib/api';
import { artistNames } from '../lib/format';
import { usePlayer } from '../store/player';
import { useUi, type PlaybackSettings } from '../store/ui';
import { setTrackGains } from './trackGain';

/** YouTube가 음량을 줄이는 기준 */
const YT_REFERENCE = -14;
/** 정보가 없는 SoundCloud 곡의 음량 (요즘 업로드 곡은 대개 이 정도로 크다) */
const SC_UNKNOWN = -9;
/** 맞출 목표 음량 */
const TARGET = { normal: -16, strong: -20 } as const;

export type NormalizeMode = NonNullable<PlaybackSettings['normalize']>;
export const normalizeMode = (p: PlaybackSettings): NormalizeMode => p.normalize ?? 'normal';

/** 곡이 실제로 들리는 음량 */
export function playedLoudness(videoId: string, l: Loudness | null | undefined): number {
  if (isSoundCloudId(videoId)) return l?.loudness ?? SC_UNKNOWN;
  return Math.min(l?.loudness ?? YT_REFERENCE, YT_REFERENCE);
}

/** 볼륨 조정량(dB, 0 이하) */
export function gainDb(videoId: string, l: Loudness | null | undefined, mode: NormalizeMode): number {
  if (mode === 'off') return 0;
  return Math.min(0, TARGET[mode] - playedLoudness(videoId, l));
}

/** 곡별로 받아 둔 음량 (null: 정보 없음) */
const loudness = new Map<string, Loudness | null>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export const loudnessOf = (videoId: string) => loudness.get(videoId);
export const onLoudness = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

function fetchFor(track: Track, ids: string[]): Promise<void> {
  const key = ids[0];
  if (loudness.has(key)) return Promise.resolve();
  let p = pending.get(key);
  if (!p) {
    p = api
      .loudness({ title: track.title, artist: artistNames(track.artists), duration: track.duration, isVideo: track.isVideo })
      .catch(() => null)
      .then((l) => {
        for (const id of ids) loudness.set(id, l);
        pending.delete(key);
        listeners.forEach((fn) => fn());
      });
    pending.set(key, p);
  }
  return p;
}

function apply() {
  const mode = normalizeMode(useUi.getState().playback);
  const gains = new Map<string, number>();
  for (const [id, l] of loudness) gains.set(id, 10 ** (gainDb(id, l, mode) / 20));
  // 아직 음량을 받지 못한 곡도 '정보 없음' 기준으로 미리 맞춰 둔다 (받은 뒤에 값이 크게 튀지 않게)
  const s = usePlayer.getState();
  for (const id of [s.playingId, s.queue[s.index]?.track.videoId]) {
    if (id && !gains.has(id)) gains.set(id, 10 ** (gainDb(id, undefined, mode) / 20));
  }
  setTrackGains(gains);
}

export function useLoudness() {
  useEffect(() => {
    const sync = () => {
      const s = usePlayer.getState();
      const cur = s.queue[s.index];
      const next = s.queue[s.index + 1];
      if (cur) {
        // 노래/동영상 전환으로 다른 영상을 틀어도 같은 곡이므로 같은 음량을 쓴다
        const ids = [cur.track.videoId, ...(s.playingId && s.playingId !== cur.track.videoId ? [s.playingId] : [])];
        void fetchFor(cur.track, ids).then(apply);
        for (const id of ids.slice(1)) if (loudness.has(cur.track.videoId)) loudness.set(id, loudness.get(cur.track.videoId)!);
      }
      if (next) void fetchFor(next.track, [next.track.videoId]).then(apply);
      apply();
    };
    let last = '';
    const unsubPlayer = usePlayer.subscribe((s) => {
      const key = `${s.queue[s.index]?.uid}|${s.playingId}|${s.queue[s.index + 1]?.uid}`;
      if (key === last) return;
      last = key;
      sync();
    });
    const unsubUi = useUi.subscribe((s, prev) => {
      if (s.playback.normalize !== prev.playback.normalize) apply();
    });
    sync();
    return () => {
      unsubPlayer();
      unsubUi();
    };
  }, []);
}
