/**
 * 볼륨 균형 조정: 곡마다 녹음된 음량이 달라서 볼륨을 계속 만져야 하는 문제를 줄인다.
 *
 * - 곡 음량은 서버가 Deezer의 같은 곡 정보(평균 음량, 대략 LUFS)에서 가져온다.
 * - YouTube는 기준(약 -14 LUFS)보다 큰 곡만 줄여서 틀고, 작은 곡은 키우지 않는다.
 *   그래서 "실제로 들리는 음량" = min(곡 음량, -14) 이고, 보통 곡은 -14로 들린다.
 * - 보통 곡(기준 ±1dB)은 건드리지 않는다 (볼륨감 그대로).
 * - 기준보다 조용한 곡은 키운다. 웹 플레이어는 100을 넘을 수 없어서, 사용자가 정한 볼륨이 100보다
 *   낮을 때 그 여유만큼만 키울 수 있다 (예: 볼륨 70이면 조용한 곡은 최대 100까지).
 * - 기준보다 큰 곡(주로 음량을 줄여 주지 않는 SoundCloud 곡)은 기준까지 줄인다. 정보가 없는 SoundCloud 곡은 큰 편으로 본다.
 * - 음량 정보가 없는 YouTube 곡은 보통 곡으로 보고 그대로 둔다.
 */
import { useEffect } from 'react';
import type { Loudness, Track } from '../../shared/types';
import { isSoundCloudId } from '../../shared/links';
import { api } from '../lib/api';
import { artistNames } from '../lib/format';
import { usePlayer } from '../store/player';
import { useUi, type PlaybackSettings } from '../store/ui';
import { setTrackGains } from './trackGain';
import { cachedCounterpart } from './useAudioVersion';

/** YouTube가 음량을 줄이는 기준 */
const YT_REFERENCE = -14;
/** 정보가 없는 SoundCloud 곡의 음량 (요즘 업로드 곡은 대개 이 정도로 크다) */
const SC_UNKNOWN = -9;
/** 조용한 곡을 최대 얼마나 키울지 (dB) */
const MAX_BOOST = { normal: 6, strong: 12 } as const;
/** 이 정도 차이는 그대로 둔다 (dB) */
const DEADBAND = 1;

export type NormalizeMode = NonNullable<PlaybackSettings['normalize']>;
export const normalizeMode = (p: PlaybackSettings): NormalizeMode => p.normalize ?? 'normal';

/** 곡이 실제로 들리는 음량 */
export function playedLoudness(videoId: string, l: Loudness | null | undefined): number {
  if (isSoundCloudId(videoId)) return l?.loudness ?? SC_UNKNOWN;
  return Math.min(l?.loudness ?? YT_REFERENCE, YT_REFERENCE);
}

/** 맞추고 싶은 조정량(dB, +: 키움, -: 줄임). 실제로 키울 수 있는 양은 볼륨 여유에 따라 더 작을 수 있다 */
export function gainDb(videoId: string, l: Loudness | null | undefined, mode: NormalizeMode): number {
  if (mode === 'off') return 0;
  const db = YT_REFERENCE - playedLoudness(videoId, l);
  if (Math.abs(db) < DEADBAND) return 0;
  return Math.min(db, MAX_BOOST[mode]);
}

/** 볼륨(0~100)에서 키울 수 있는 최대량(dB) */
export const headroomDb = (volume: number) => (volume > 0 ? 20 * Math.log10(100 / volume) : 0);

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
        // (곡이 막 바뀐 순간에는 playingId가 아직 이전 곡이라, 이 곡의 짝 영상일 때만 묶는다)
        const other = cachedCounterpart(cur.track.videoId)?.other.videoId;
        const ids = [cur.track.videoId, ...(s.playingId && s.playingId !== cur.track.videoId && s.playingId === other ? [s.playingId] : [])];
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
