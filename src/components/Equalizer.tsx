import { useEffect, useRef } from 'react';
import { Reactive } from '../player/reactive';
import { spectrum, toBands } from '../player/spectrum';
import { useSpectrumState } from '../player/useSpectrum';

/** 막대 높이(px): 최소~최대 */
const MIN_H = 3;
const MAX_H = 14;
/** 스펙트럼이 꺼져 있을 때의 정지 모양 (0~1) */
const STATIC = [0.45, 0.9, 0.65, 0.35];
const PAUSED = [0, 0, 0, 0];

/**
 * 재생 중 표시 아이콘 (YouTube Music처럼 끝이 둥근 막대 4개).
 * 실시간 스펙트럼이 켜져 있으면 실제 소리의 저음~고음 4개 대역에 맞춰 움직인다.
 * 둥근 끝이 찌그러지지 않도록 scale 대신 실제 높이를 바꾼다.
 */
export function Equalizer({ paused }: { paused?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useSpectrumState();
  const live = state === 'on' && !paused;

  useEffect(() => {
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const set = (values: ArrayLike<number>) =>
      bars.forEach((el, i) => (el.style.height = `${MIN_H + Math.max(0, Math.min(1, values[i])) * (MAX_H - MIN_H)}px`));
    if (!live) {
      set(paused ? PAUSED : STATIC);
      return;
    }
    const bands = new Float32Array(4);
    // 대역마다 최근 범위에 맞춰 펼쳐서 4개 막대가 각자 크게 움직이게 한다
    const reactive = new Reactive(4, { mode: 'range', attack: 0.45, release: 0.24 });
    return spectrum.onFrame((freq, rate) => {
      toBands(freq, rate, 4, bands, 50, 10000);
      // 꼭대기·바닥까지 매번 치지 않도록 15~90% 사이에서 움직이게 한다
      const v = reactive.update(bands);
      set(Array.from(v, (x) => 0.15 + x * 0.75));
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
