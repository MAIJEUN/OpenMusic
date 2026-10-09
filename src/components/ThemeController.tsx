import { useEffect, useRef } from 'react';
import { DEFAULT_PALETTE, extractPalette, rgbCss, type Palette } from '../lib/palette';
import { spectrum } from '../player/spectrum';
import { useSpectrumState } from '../player/useSpectrum';
import { usePlayer } from '../store/player';

function applyPalette(p: Palette) {
  const root = document.documentElement.style;
  root.setProperty('--theme-1', rgbCss(p.primary));
  root.setProperty('--theme-2', rgbCss(p.secondary));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', rgbCss(p.secondary));
}

/**
 * 지금 재생 중인 곡의 앨범 아트 색으로 페이지 전체의 색감(--theme-1, --theme-2)을 바꾼다.
 * 색은 CSS 트랜지션으로 부드럽게 바뀐다. 실시간 스펙트럼이 켜져 있으면 배경 빛이 저음에 맞춰 숨쉰다.
 */
export function ThemeController() {
  const thumbnail = usePlayer((s) => s.queue[s.index]?.track.thumbnail);
  const ambientRef = useRef<HTMLDivElement>(null);
  const spectrumState = useSpectrumState();

  useEffect(() => {
    let alive = true;
    if (!thumbnail) {
      applyPalette(DEFAULT_PALETTE);
      return;
    }
    extractPalette(thumbnail)
      .then((p) => alive && applyPalette(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [thumbnail]);

  // 저음 에너지에 맞춰 배경 빛의 세기를 바꾼다
  useEffect(() => {
    const el = ambientRef.current;
    if (!el) return;
    if (spectrumState !== 'on') {
      el.style.opacity = '';
      return;
    }
    let level = 0;
    return spectrum.onFrame((freq, rate) => {
      const binHz = rate / 2 / freq.length;
      const end = Math.max(2, Math.round(180 / binHz));
      let sum = 0;
      for (let i = 1; i < end; i++) sum += freq[i];
      const bass = sum / ((end - 1) * 255);
      level = Math.max(bass, level * 0.94);
      el.style.opacity = String(0.55 + level * 0.45);
    });
  }, [spectrumState]);

  return <div ref={ambientRef} className="ambient" aria-hidden />;
}
