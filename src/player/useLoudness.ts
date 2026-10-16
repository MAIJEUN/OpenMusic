/**
 * 볼륨 균형 조정: 곡마다 녹음된 음량이 달라서 볼륨을 계속 만져야 하는 문제를 줄인다.
 *
 * 곡이 "실제로 들리는 음량"을 다음 순서로 정한다.
 * 1. 측정값: 실시간 스펙트럼이 켜져 있을 때 실제 소리를 재 둔 값 (loudnessMeter) — 가장 정확하다.
 * 2. Deezer 음량(곡 전체 평균, 대략 LUFS)으로 추정: YouTube가 큰 곡을 기준(-14)까지 줄여 주는지는
 *    측정값과 Deezer 값을 비교해서 판단한다 (판단 전에는 줄여 준다고 본다). 측정 방식과의 차이(offset)도 함께 맞춘다.
 * 3. 둘 다 없으면 보통 곡으로 보고 그대로 둔다 (SoundCloud는 음량을 줄여 주지 않아서 큰 편으로 본다).
 *
 * 조정: 보통 곡(기준 ±1.5dB)은 건드리지 않고, 조용한 곡은 볼륨 여유 안에서 키우고, 큰 곡은 기준까지 줄인다.
 * 웹 플레이어는 100을 넘을 수 없어서, 사용자가 정한 볼륨이 100보다 낮을 때 그 여유만큼만 키울 수 있다.
 */
import { useEffect } from 'react';
import type { Loudness, Track } from '../../shared/types';
import { isSoundCloudId } from '../../shared/links';
import { api } from '../lib/api';
import { artistNames } from '../lib/format';
import { usePlayer } from '../store/player';
import { useUi, type PlaybackSettings } from '../store/ui';
import { allMeasured, measuredOf, onMeasured, setReferenceLookup } from './loudnessMeter';
import { setTrackGains, trackGain } from './trackGain';
import { cachedCounterpart } from './useAudioVersion';

/** YouTube가 음량을 줄이는 기준 */
const YT_REFERENCE = -14;
/** 정보가 없는 SoundCloud 곡의 음량 (요즘 업로드 곡은 대개 이 정도로 크다) */
const SC_UNKNOWN = -9;
/** 조용한 곡을 최대 얼마나 키울지 (dB) */
const MAX_BOOST = { normal: 6, strong: 12 } as const;
/** 이 정도 차이는 그대로 둔다 (dB) */
const DEADBAND = 1.5;

export type NormalizeMode = NonNullable<PlaybackSettings['normalize']>;
export const normalizeMode = (p: PlaybackSettings): NormalizeMode => p.normalize ?? 'normal';

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};

export interface Calibration {
  /** YouTube가 이 사이트(임베드 플레이어)에서도 큰 곡을 줄여 주는지 */
  ytNormalizes: 'yes' | 'no' | 'unknown';
  /** Deezer 값 → 측정 방식으로 옮길 때 더할 값 */
  offset: number;
  /** 판단에 쓴 곡 수 */
  samples: number;
  /** 보통 곡의 음량 (측정 방식 기준) */
  reference: number;
}

let calibration: Calibration = { ytNormalizes: 'unknown', offset: 0, samples: 0, reference: YT_REFERENCE };
export const getCalibration = () => calibration;

/** 측정값과 Deezer 값을 비교해서 YouTube의 음량 맞춤 여부와 차이를 구한다 */
function calibrate() {
  const pts = Object.entries(allMeasured())
    .filter(([id, m]) => !isSoundCloudId(id) && typeof m.ref === 'number')
    .map(([, m]) => ({ p: m.lufs, l: m.ref as number }));
  const loud = pts.filter((x) => x.l > -12).length;
  let ytNormalizes: Calibration['ytNormalizes'] = 'unknown';
  let offset = 0;
  if (pts.length >= 4 && loud >= 2) {
    // 두 가지 경우(줄여 줌 / 안 줄여 줌) 중 측정값을 더 잘 설명하는 쪽을 고른다
    const fit = (est: (l: number) => number) => {
      const r = pts.map((x) => x.p - est(x.l));
      const off = median(r);
      return { off, spread: median(r.map((v) => Math.abs(v - off))) };
    };
    const yes = fit((l) => Math.min(l, YT_REFERENCE));
    const no = fit((l) => l);
    ytNormalizes = yes.spread <= no.spread ? 'yes' : 'no';
    offset = ytNormalizes === 'yes' ? yes.off : no.off;
  }
  // 보통 곡의 음량: 줄여 주면 그 기준, 안 줄여 주면 지금까지 잰 곡들의 중간값
  const yt = Object.entries(allMeasured())
    .filter(([id]) => !isSoundCloudId(id))
    .map(([, m]) => m.lufs);
  const reference = ytNormalizes === 'no' && yt.length >= 4 ? median(yt) : YT_REFERENCE + offset;
  calibration = { ytNormalizes, offset, samples: pts.length, reference };
}

export type LoudnessSource = 'measured' | 'deezer' | 'estimate';

/** 곡이 실제로 들리는 음량과 그 근거 */
export function playedLoudness(videoId: string, l: Loudness | null | undefined): { lufs: number; source: LoudnessSource } {
  const m = measuredOf(videoId);
  if (m) return { lufs: m.lufs, source: 'measured' };
  const c = calibration;
  if (isSoundCloudId(videoId)) return { lufs: (l?.loudness ?? SC_UNKNOWN) + c.offset, source: l ? 'deezer' : 'estimate' };
  if (!l) return { lufs: c.reference, source: 'estimate' };
  const est = c.ytNormalizes === 'no' ? l.loudness : Math.min(l.loudness, YT_REFERENCE);
  return { lufs: est + c.offset, source: 'deezer' };
}

/** 맞추고 싶은 조정량(dB, +: 키움, -: 줄임). 실제로 키울 수 있는 양은 볼륨 여유에 따라 더 작을 수 있다 */
export function gainDb(videoId: string, l: Loudness | null | undefined, mode: NormalizeMode): number {
  if (mode === 'off') return 0;
  const db = calibration.reference - playedLoudness(videoId, l).lufs;
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
// 측정할 때 그 곡의 Deezer 음량도 함께 남겨서 비교(calibrate)에 쓴다
setReferenceLookup((id) => {
  const own = loudness.get(id);
  if (own) return own.loudness;
  // 노래/동영상 전환으로 짝 영상을 트는 중이면 원래 곡의 값
  const s = usePlayer.getState();
  const cur = s.queue[s.index]?.track.videoId;
  return s.playingId === id && cur ? loudness.get(cur)?.loudness : undefined;
});

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

/** freezeCurrent: 듣는 중에 측정값이 생겨도 지금 곡의 볼륨은 갑자기 바꾸지 않는다 (다음에 틀 때부터) */
function apply(freezeCurrent = false) {
  const mode = normalizeMode(useUi.getState().playback);
  const gains = new Map<string, number>();
  for (const [id, l] of loudness) gains.set(id, 10 ** (gainDb(id, l, mode) / 20));
  const playing = usePlayer.getState().playingId;
  if (freezeCurrent && playing) gains.set(playing, trackGain(playing));
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
        void fetchFor(cur.track, ids).then(() => apply());
        for (const id of ids.slice(1)) if (loudness.has(cur.track.videoId)) loudness.set(id, loudness.get(cur.track.videoId)!);
      }
      if (next) void fetchFor(next.track, [next.track.videoId]).then(() => apply());
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
    const unsubMeasured = onMeasured(() => {
      calibrate();
      apply(true);
      listeners.forEach((fn) => fn());
    });
    calibrate();
    sync();
    return () => {
      unsubPlayer();
      unsubUi();
      unsubMeasured();
    };
  }, []);
}
