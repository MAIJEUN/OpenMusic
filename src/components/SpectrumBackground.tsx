import { useEffect, useRef } from 'react';
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

/** 하단 재생 바 뒤에 그리는 실시간 오디오 스펙트럼 (곡선 그래프, 앨범 아트 색) */
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
    let peaks = new Float32Array(0);
    let xs = new Float32Array(0);
    let ys = new Float32Array(0);
    let c1: RGB = [255, 78, 69];
    let c2: RGB = [199, 15, 91];
    let frame = 0;

    const unsubscribe = spectrum.onFrame((freq, rate) => {
      // 색은 몇 프레임마다 한 번만 읽는다 (곡이 바뀌면 CSS 트랜지션을 따라 부드럽게 변함)
      if (frame++ % 6 === 0) {
        c1 = readColor('--theme-1', c1);
        c2 = readColor('--theme-2', c2);
      }
      const n = Math.max(32, Math.min(128, Math.floor(width / 12)));
      if (bands.length !== n) {
        bands = new Float32Array(n);
        peaks = new Float32Array(n);
        xs = new Float32Array(n + 2);
        ys = new Float32Array(n + 2);
      }
      toBands(freq, rate, n, bands);

      ctx.clearRect(0, 0, width, height);
      const top = height * 0.15;
      const usable = height - top;
      const step = width / (n - 1);

      // 양 끝은 바닥에 붙여서 그래프가 화면 가장자리에서 자연스럽게 시작/끝나게 한다
      xs[0] = 0;
      ys[0] = height;
      for (let i = 0; i < n; i++) {
        const v = Math.pow(bands[i], 1.5);
        peaks[i] = Math.max(v, peaks[i] - 0.006);
        xs[i + 1] = i * step;
        ys[i + 1] = height - v * usable;
      }
      xs[n + 1] = width;
      ys[n + 1] = height;

      // 면: 위는 강조색, 아래로 갈수록 보조색으로 옅어짐
      const fill = ctx.createLinearGradient(0, top, 0, height);
      fill.addColorStop(0, rgba(c1, 0.4));
      fill.addColorStop(0.55, rgba(c2, 0.28));
      fill.addColorStop(1, rgba(c2, 0.04));
      ctx.beginPath();
      curve(ctx, xs, ys);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      // 선: 강조색 + 은은한 빛
      ctx.beginPath();
      curve(ctx, xs, ys);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(c1, 0.85);
      ctx.shadowColor = rgba(c1, 0.8);
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 최고점 잔상: 천천히 내려오는 얇은 선
      for (let i = 0; i < n; i++) ys[i + 1] = height - peaks[i] * usable;
      ctx.beginPath();
      curve(ctx, xs, ys);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
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
