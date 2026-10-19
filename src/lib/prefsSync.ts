/**
 * 보관함 외에 로그인으로 함께 동기화하는 설정.
 * - 재생 설정: 마지막으로 바꾼 쪽 (playbackAt)
 * - 곡별 가사 설정(싱크·직접 고른 원곡·가사 숨기기): 곡마다 마지막으로 바꾼 쪽 (lyricsAt). 지운 설정도 시각이 남아 있어 되살아나지 않는다
 * - 음량 측정값: 곡마다 더 길게 잰 쪽. '측정 기록 지우기'를 한 시각보다 전에 잰 값은 버린다
 *
 * 볼륨·화면 배치처럼 기기마다 다른 게 자연스러운 설정은 동기화하지 않는다.
 */
import type { PlaybackSettings, LyricsOverride } from '../store/ui';
import { useUi } from '../store/ui';
import type { Measured } from '../player/loudnessMeter';
import { allMeasured, measuredClearedAt, replaceMeasured } from '../player/loudnessMeter';

export interface Prefs {
  playback: PlaybackSettings;
  playbackAt: number;
  lyricsOffsets: Record<string, number>;
  lyricsOverrides: Record<string, LyricsOverride>;
  lyricsAt: Record<string, number>;
  measured: Record<string, Measured>;
  measuredClearedAt: number;
}

export function localPrefs(): Prefs {
  const u = useUi.getState();
  return {
    playback: u.playback,
    playbackAt: u.playbackAt,
    lyricsOffsets: u.lyricsOffsets,
    lyricsOverrides: u.lyricsOverrides,
    lyricsAt: u.lyricsAt,
    measured: allMeasured(),
    measuredClearedAt: measuredClearedAt(),
  };
}

/** 서버에서 받은 값을 안전하게 읽는다 (없거나 모양이 다르면 null) */
export function asPrefs(raw: unknown): Prefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Prefs>;
  const rec = <T,>(x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, T>) : {});
  return {
    playback: { ...useUi.getState().playback, ...rec<never>(p.playback) },
    playbackAt: Number(p.playbackAt) || 0,
    lyricsOffsets: rec<number>(p.lyricsOffsets),
    lyricsOverrides: rec<LyricsOverride>(p.lyricsOverrides),
    lyricsAt: rec<number>(p.lyricsAt),
    measured: rec<Measured>(p.measured),
    measuredClearedAt: Number(p.measuredClearedAt) || 0,
  };
}

/**
 * 두 값 중 더 나중에 바뀐 쪽. 시각이 같으면(예: 둘 다 처음 상태) 내용으로 정해서
 * 어느 기기에서 합쳐도 같은 결과가 나오게 한다 (안 그러면 두 기기가 서로 덮어쓰기를 반복한다)
 */
function newer<T>(ta: number, va: T, tb: number, vb: T): 'a' | 'b' {
  if (ta !== tb) return tb > ta ? 'b' : 'a';
  return JSON.stringify(canon(vb) ?? null) > JSON.stringify(canon(va) ?? null) ? 'b' : 'a';
}

export function mergePrefs(a: Prefs, b: Prefs): Prefs {
  // 재생 설정
  const pb = newer(a.playbackAt, a.playback, b.playbackAt, b.playback) === 'b' ? b : a;

  // 곡별 가사 설정: 곡마다 더 나중에 바꾼 쪽의 싱크·원곡 설정을 (없으면 지운 것으로) 쓴다
  const lyricsAt: Record<string, number> = {};
  const lyricsOffsets: Record<string, number> = {};
  const lyricsOverrides: Record<string, LyricsOverride> = {};
  const ids = new Set([...Object.keys(a.lyricsAt), ...Object.keys(b.lyricsAt), ...Object.keys(a.lyricsOffsets), ...Object.keys(b.lyricsOffsets), ...Object.keys(a.lyricsOverrides), ...Object.keys(b.lyricsOverrides)]);
  for (const id of ids) {
    const ta = a.lyricsAt[id] ?? 0;
    const tb = b.lyricsAt[id] ?? 0;
    const src = newer(ta, [a.lyricsOffsets[id], a.lyricsOverrides[id]], tb, [b.lyricsOffsets[id], b.lyricsOverrides[id]]) === 'b' ? b : a;
    const t = Math.max(ta, tb);
    if (t) lyricsAt[id] = t;
    if (src.lyricsOffsets[id] !== undefined) lyricsOffsets[id] = src.lyricsOffsets[id];
    if (src.lyricsOverrides[id] !== undefined) lyricsOverrides[id] = src.lyricsOverrides[id];
  }

  // 음량 측정값
  const cleared = Math.max(a.measuredClearedAt, b.measuredClearedAt);
  const measured: Record<string, Measured> = {};
  for (const src of [a.measured, b.measured]) {
    for (const [id, m] of Object.entries(src)) {
      if (!m || m.at <= cleared) continue;
      const cur = measured[id];
      const better =
        !cur ||
        m.seconds > cur.seconds ||
        (m.seconds === cur.seconds && (m.at > cur.at || (m.at === cur.at && m.lufs > cur.lufs)));
      if (better) measured[id] = m;
    }
  }

  return {
    playback: pb.playback,
    playbackAt: pb.playbackAt,
    lyricsOffsets,
    lyricsOverrides,
    lyricsAt,
    measured,
    measuredClearedAt: cleared,
  };
}

/** 순서와 상관없이 내용이 같은지 */
function canon(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') {
    return Object.fromEntries(
      Object.keys(x as object)
        .sort()
        .map((k) => [k, canon((x as Record<string, unknown>)[k])]),
    );
  }
  return x;
}
export const samePrefs = (a: Prefs, b: Prefs) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** 이 기기에 반영 (바뀐 부분만) */
export function applyPrefs(local: Prefs, next: Prefs) {
  const ui = { playback: next.playback, playbackAt: next.playbackAt, lyricsOffsets: next.lyricsOffsets, lyricsOverrides: next.lyricsOverrides, lyricsAt: next.lyricsAt };
  const localUi = { playback: local.playback, playbackAt: local.playbackAt, lyricsOffsets: local.lyricsOffsets, lyricsOverrides: local.lyricsOverrides, lyricsAt: local.lyricsAt };
  if (JSON.stringify(canon(ui)) !== JSON.stringify(canon(localUi))) useUi.getState().applySynced(ui);
  if (
    JSON.stringify(canon(next.measured)) !== JSON.stringify(canon(local.measured)) ||
    next.measuredClearedAt !== local.measuredClearedAt
  ) {
    replaceMeasured(next.measured, next.measuredClearedAt);
  }
}
