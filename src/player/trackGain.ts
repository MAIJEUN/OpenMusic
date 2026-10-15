/**
 * 곡(영상 ID)별 볼륨 배율 (볼륨 균형 조정). 플레이어 엔진이 볼륨을 정할 때 곱한다.
 * 값은 useLoudness가 곡 음량을 받아 채운다.
 */
const gains = new Map<string, number>();
const listeners = new Set<() => void>();

export const trackGain = (videoId: string | null | undefined) => (videoId ? (gains.get(videoId) ?? 1) : 1);

export function setTrackGains(next: Map<string, number>) {
  let changed = next.size !== gains.size;
  for (const [k, v] of next) if (gains.get(k) !== v) changed = true;
  if (!changed) return;
  gains.clear();
  for (const [k, v] of next) gains.set(k, v);
  listeners.forEach((fn) => fn());
}

export function onTrackGainChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
