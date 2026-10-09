import { useEffect, useRef } from 'react';
import { spectrum, toBands } from '../player/spectrum';
import { useSpectrumState } from '../player/useSpectrum';

/** 정지 상태(스펙트럼이 꺼져 있을 때)의 막대 높이 */
const STATIC = [0.45, 0.9, 0.65, 0.35];
const PAUSED = [0.25, 0.25, 0.25, 0.25];

/**
 * 재생 중 표시 아이콘. 실시간 스펙트럼이 켜져 있으면 실제 소리의 저음~고음 4개 대역을 그대로 보여준다.
 */
export function Equalizer({ paused }: { paused?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useSpectrumState();
  const live = state === 'on' && !paused;

  useEffect(() => {
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const set = (values: ArrayLike<number>) =>
      bars.forEach((el, i) => (el.style.transform = `scaleY(${Math.max(0.12, Math.min(1, values[i]))})`));
    if (!live) {
      set(paused ? PAUSED : STATIC);
      return;
    }
    const bands = new Float32Array(4);
    return spectrum.onFrame((freq, rate) => {
      toBands(freq, rate, 4, bands, 50, 10000);
      set(bands);
    });
  }, [live, paused]);

  return (
    <span ref={ref} className="equalizer" aria-label={paused ? '일시중지됨' : '재생 중'}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
