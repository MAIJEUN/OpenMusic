import { useEffect, useRef } from 'react';
import { Reactive } from '../player/reactive';
import { spectrum, toBands } from '../player/spectrum';
import { useSpectrumState } from '../player/useSpectrum';

type RGB = [number, number, number];

/** CSS 변수(--theme-1 등)의 현재 색을 읽는다. 등록된 @property라 트랜지션 중간값도 읽힌다 */
function readColor(name: string, fallback: RGB): RGB {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : fallback;
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;

/** 점들을 지나는 부드러운 곡선 (중점을 잇는 2차 베지어) */
function curve(ctx: CanvasRenderingContext2D, xs: Float32Array, ys: Float32Array) {
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    const my = (ys[i] + ys[i + 1]) / 2;
    ctx.quadraticCurveTo(xs[i], ys[i], mx, my);
  }
  ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
}

/** 하단 재생 바 뒤에 그리는 실시간 오디오 스펙트럼 (곡선 그래프, 테마 색을 옅게) */
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
    let reactive = new Reactive(0);
    let xs = new Float32Array(0);
    let ys = new Float32Array(0);
    let tint: RGB = [200, 200, 200];
    let frame = 0;

    const unsubscribe = spectrum.onFrame((freq, rate) => {
      // 테마 색을 회색과 섞어 차분하게 쓴다 (몇 프레임마다 한 번만 읽음)
      if (frame++ % 8 === 0) {
        const c = readColor('--theme-1', [255, 78, 69]);
        tint = [c[0] * 0.55 + 200 * 0.45, c[1] * 0.55 + 200 * 0.45, c[2] * 0.55 + 200 * 0.45];
      }
      const n = Math.max(32, Math.min(96, Math.floor(width / 16)));
      if (bands.length !== n) {
        bands = new Float32Array(n);
        reactive = new Reactive(n, { mode: 'shape', attack: 0.9, release: 0.5 });
        xs = new Float32Array(n + 2);
        ys = new Float32Array(n + 2);
      }
      toBands(freq, rate, n, bands);
      const level = reactive.update(bands);

      ctx.clearRect(0, 0, width, height);
      const usable = height * 0.85;
      const step = width / (n - 1);

      xs[0] = 0;
      ys[0] = height;
      for (let i = 0; i < n; i++) {
        // 이웃 대역을 살짝만 섞어 곡선이 지저분하지 않게 한다 (움직임은 살림)
        const a = level[Math.max(0, i - 1)];
        const b = level[i];
        const c = level[Math.min(n - 1, i + 1)];
        const v = (a + b * 4 + c) / 6;
        xs[i + 1] = i * step;
        ys[i + 1] = height - v * usable;
      }
      xs[n + 1] = width;
      ys[n + 1] = height;

      // 면: 아주 옅은 반투명 언덕 모양
      const fill = ctx.createLinearGradient(0, height - usable, 0, height);
      fill.addColorStop(0, rgba(tint, 0.16));
      fill.addColorStop(1, rgba(tint, 0.02));
      ctx.beginPath();
      curve(ctx, xs, ys);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      // 윤곽선: 얇고 흐리게
      ctx.beginPath();
      curve(ctx, xs, ys);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = rgba(tint, 0.35);
      ctx.stroke();
    });

    return () => {
      unsubscribe();
      ro.disconnect();
      ctx.clearRect(0, 0, width, height);
    };
  }, [state]);

  return <canvas ref={canvasRef} className={`spectrum-bg ${state === 'on' ? 'spectrum-bg--on' : ''}`} aria-hidden />;
}
