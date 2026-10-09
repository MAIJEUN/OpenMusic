import { useEffect, useRef } from 'react';
import { spectrum, toBands } from '../player/spectrum';
import { useSpectrumState } from '../player/useSpectrum';

/** 하단 재생 바 뒤에 그리는 실시간 오디오 스펙트럼 */
export function SpectrumBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useSpectrumState();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || state !== 'on') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let bands = new Float32Array(0);
    const unsubscribe = spectrum.onFrame((freq, rate) => {
      // 막대 하나가 약 8px이 되도록 대역 수를 정한다
      const n = Math.max(24, Math.min(160, Math.floor(width / 8)));
      if (bands.length !== n) bands = new Float32Array(n);
      toBands(freq, rate, n, bands);

      ctx.clearRect(0, 0, width, height);
      const gap = 2;
      const barW = width / n - gap;
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, 'rgba(255, 78, 69, 0.45)');
      grad.addColorStop(0.6, 'rgba(199, 15, 91, 0.3)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.12)');
      ctx.fillStyle = grad;
      for (let i = 0; i < n; i++) {
        // 작은 소리는 줄이고 큰 소리는 살려서 대비를 준다
        const v = Math.pow(bands[i], 1.6);
        const h = Math.max(1, v * height);
        ctx.fillRect(i * (barW + gap) + gap / 2, height - h, barW, h);
      }
    });

    return () => {
      unsubscribe();
      ro.disconnect();
      ctx.clearRect(0, 0, width, height);
    };
  }, [state]);

  return <canvas ref={canvasRef} className={`spectrum-bg ${state === 'on' ? 'spectrum-bg--on' : ''}`} aria-hidden />;
}
