/**
 * 곡 음량 측정 (실시간 스펙트럼이 켜져 있을 때).
 *
 * 탭 공유로 받은 실제 소리(K-weighting 적용)를 0.1초마다 읽어서, 그 순간의 플레이어 볼륨만큼을 되돌려
 * "볼륨 100일 때 이 곡이 실제로 들리는 음량"을 구한다. YouTube가 음량을 줄였는지 여부도 그대로 반영된다.
 *
 * 특정 구간만 크게 튀는 곡에 휘둘리지 않도록 방송 음량 표준(EBU R128)의 방식을 따른다:
 * - 3초 단위 단기 음량(short-term loudness)을 1초마다 구하고
 * - 무음·아주 작은 구간은 빼고(절대 -70 LUFS, 상대 -20 LU 게이트)
 * - 남은 값의 중간값(median)을 곡 음량으로 쓴다 (평균과 달리 짧게 튀는 구간의 영향을 거의 받지 않는다)
 */
import { useEffect } from 'react';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { spectrum } from './spectrum';
import { trackGain } from './trackGain';

export interface Measured {
  /** 볼륨 100에서 실제로 들리는 음량 (LUFS) */
  lufs: number;
  /** 측정에 쓴 소리 길이(초) */
  seconds: number;
  at: number;
  /** 측정할 때 알던 이 곡의 Deezer 음량 (YouTube 음량 맞춤 여부 판단용) */
  ref?: number;
}

let referenceOf: (videoId: string) => number | undefined = () => undefined;
/** 곡의 Deezer 음량을 알려 줄 함수 (useLoudness가 넣어 준다) */
export function setReferenceLookup(fn: (videoId: string) => number | undefined) {
  referenceOf = fn;
}

const KEY = 'om-loudness-measured';
const MAX_ENTRIES = 3000;
/** 이만큼(초) 들어야 곡 음량으로 인정 */
const MIN_SECONDS = 30;
const TICK_MS = 100;

let measured: Record<string, Measured> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Measured>;
  } catch {
    return {};
  }
})();
const listeners = new Set<() => void>();

/** '측정 기록 지우기'를 한 시각 — 동기화할 때 그 전에 잰 값이 다른 기기에서 되살아나지 않게 */
const CLEARED_KEY = 'om-loudness-cleared';
let clearedAt = (() => {
  try {
    return Number(localStorage.getItem(CLEARED_KEY)) || 0;
  } catch {
    return 0;
  }
})();
export const measuredClearedAt = () => clearedAt;

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(measured));
    localStorage.setItem(CLEARED_KEY, String(clearedAt));
  } catch {
    /* 저장 공간이 없으면 이번 세션에서만 쓴다 */
  }
};

/** 동기화로 받은 측정값으로 바꾼다 */
export function replaceMeasured(next: Record<string, Measured>, cleared: number) {
  measured = next;
  clearedAt = cleared;
  persist();
  listeners.forEach((fn) => fn());
}

export const measuredOf = (videoId: string): Measured | undefined => measured[videoId];
export const allMeasured = () => measured;
export const onMeasured = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

function save(videoId: string, m: Measured) {
  const ref = referenceOf(videoId);
  measured = { ...measured, [videoId]: ref === undefined ? m : { ...m, ref } };
  const keys = Object.keys(measured);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.sort((a, b) => measured[a].at - measured[b].at).slice(0, keys.length - MAX_ENTRIES)) delete measured[k];
  }
  persist();
  listeners.forEach((fn) => fn());
}

export function clearMeasured() {
  measured = {};
  clearedAt = Date.now();
  persist();
  listeners.forEach((fn) => fn());
}

const toLufs = (energy: number) => -0.691 + 10 * Math.log10(energy);

/** 0.1초 단위 에너지 기록 → 곡 음량 (EBU R128 단기 음량의 게이트 적용 중간값) */
export function songLoudness(blocks: number[]): { lufs: number; seconds: number } | null {
  const per = 1000 / TICK_MS; // 1초당 블록 수
  const win = 3 * per;
  const st: number[] = [];
  for (let end = win; end <= blocks.length; end += per) {
    let sum = 0;
    for (let i = end - win; i < end; i++) sum += blocks[i];
    const l = toLufs(sum / win);
    if (l > -70) st.push(l);
  }
  if (!st.length) return null;
  // 상대 게이트: 단기 음량 전체(에너지 평균)보다 20 LU 이상 작은 구간(조용한 인트로·페이드아웃 등)은 뺀다
  const mean = toLufs(st.reduce((a, l) => a + 10 ** ((l + 0.691) / 10), 0) / st.length);
  const gated = st.filter((l) => l > mean - 20).sort((a, b) => a - b);
  if (!gated.length) return null;
  return { lufs: gated[Math.floor(gated.length / 2)], seconds: gated.length };
}

export function useLoudnessMeter() {
  useEffect(() => {
    let id: string | null = null;
    let blocks: number[] = [];
    let lastSaved = 0;

    const finish = () => {
      if (id && blocks.length) {
        const r = songLoudness(blocks);
        const prev = measured[id];
        // 더 길게 들은 측정을 남긴다
        if (r && r.seconds >= MIN_SECONDS && (!prev || r.seconds >= prev.seconds)) save(id, { ...r, at: Date.now() });
      }
      blocks = [];
      lastSaved = 0;
    };

    const timer = setInterval(() => {
      const s = usePlayer.getState();
      if (s.playingId !== id) {
        finish();
        id = s.playingId;
      }
      if (!id || s.status !== 'playing' || spectrum.state !== 'on') return;
      // 크로스페이드로 두 곡이 섞이는 앞뒤 구간은 재지 않는다
      const edge = Math.max(3, useUi.getState().playback.crossfade + 1);
      if (s.position < edge || (s.duration > 0 && s.position > s.duration - edge)) return;
      const applied = s.muted ? 0 : Math.min(100, s.volume * trackGain(id)) / 100;
      if (applied < 0.05) return;
      const energy = spectrum.readEnergy();
      if (energy === null) return;
      // 플레이어 볼륨을 되돌려 '볼륨 100일 때'의 에너지로
      blocks.push(Math.max(energy, 1e-12) / (applied * applied));
      if (blocks.length > 20 * 60 * (1000 / TICK_MS)) blocks.shift();
      // 들으면서도 가끔 저장해 둔다 (곡 중간에 창을 닫아도 남게)
      if (blocks.length - lastSaved >= 15 * (1000 / TICK_MS)) {
        lastSaved = blocks.length;
        const r = songLoudness(blocks);
        const prev = measured[id];
        if (r && r.seconds >= MIN_SECONDS && (!prev || r.seconds >= prev.seconds)) save(id, { ...r, at: Date.now() });
      }
    }, TICK_MS);
    return () => {
      finish();
      clearInterval(timer);
    };
  }, []);
}
