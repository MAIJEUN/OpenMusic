/**
 * 앨범 아트에서 대표 색 두 가지를 뽑는다.
 * Google 이미지 서버는 CORS를 보장하지 않아서 /api/image 중계를 거쳐 캔버스로 픽셀을 읽는다.
 */
import { apiUrl } from './api';
import { thumbSize } from './thumb';

export type RGB = [number, number, number];
export interface Palette {
  /** 강조색 (진행 막대, 그래프 선 등) */
  primary: RGB;
  /** 보조색 (배경 그라데이션 등) */
  secondary: RGB;
}

export const DEFAULT_PALETTE: Palette = { primary: [255, 78, 69], secondary: [199, 15, 91] };

const cache = new Map<string, Promise<Palette>>();

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as RGB;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255)) as RGB;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 어두운 화면에서 잘 보이도록 채도/밝기를 보정 */
function tune(rgb: RGB, lightness: [number, number], minSat = 0.45): RGB {
  const [h, s, l] = rgbToHsl(rgb);
  if (s < 0.08) return hslToRgb(h, 0.08, clamp(l, lightness[0], lightness[1])); // 무채색 앨범은 무채색 그대로
  return hslToRgb(h, clamp(s, minSat, 0.9), clamp(l, lightness[0], lightness[1]));
}

function imageSource(url: string): string {
  // 같은 출처(목 데이터 이미지 등)는 그대로, 외부 이미지는 중계 경유
  if (url.startsWith('/') || url.startsWith(location.origin)) return url;
  return apiUrl(`/image?url=${encodeURIComponent(url)}`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다'));
    img.src = src;
  });
}

function analyse(img: HTMLImageElement): Palette {
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  // 색상(hue)을 24칸으로 나눠 '선명하고 많이 쓰인' 색에 점수를 준다
  const BUCKETS = 24;
  const score = new Float64Array(BUCKETS);
  const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0, 0]);
  let grayR = 0;
  let grayG = 0;
  let grayB = 0;
  let grayN = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (l < 0.06 || l > 0.97) continue; // 레터박스(검은 띠)와 흰 배경 제외
    grayR += rgb[0];
    grayG += rgb[1];
    grayB += rgb[2];
    grayN++;
    if (s < 0.15) continue;
    const b = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    score[b] += w;
    sum[b][0] += rgb[0] * w;
    sum[b][1] += rgb[1] * w;
    sum[b][2] += rgb[2] * w;
    sum[b][3] += w;
  }

  const order = Array.from(score.keys()).sort((a, b) => score[b] - score[a]);
  const total = score.reduce((a, b) => a + b, 0);
  const avg = (b: number): RGB => [sum[b][0] / sum[b][3], sum[b][1] / sum[b][3], sum[b][2] / sum[b][3]];

  // 거의 무채색인 앨범: 평균색을 바탕으로 은은한 회색 계열
  if (!grayN || total < grayN * 0.03) {
    const g: RGB = grayN ? [grayR / grayN, grayG / grayN, grayB / grayN] : [150, 150, 160];
    return { primary: tune(g, [0.62, 0.72], 0), secondary: tune(g, [0.3, 0.4], 0) };
  }

  const first = order[0];
  const primary = avg(first);
  // 두 번째 색: 색상이 충분히 다른 칸 중 점수가 높은 것. 없으면 첫 색을 살짝 돌린 색
  const second = order.find((b) => {
    if (score[b] < score[first] * 0.12) return false;
    const dist = Math.min(Math.abs(b - first), BUCKETS - Math.abs(b - first));
    return dist >= 3;
  });
  const [h, s, l] = rgbToHsl(primary);
  const secondary = second !== undefined ? avg(second) : hslToRgb(h + 35, s, l * 0.8);

  return { primary: tune(primary, [0.52, 0.64]), secondary: tune(secondary, [0.34, 0.48]) };
}

export function extractPalette(url: string): Promise<Palette> {
  const small = thumbSize(url, 96) ?? url;
  let p = cache.get(small);
  if (!p) {
    p = loadImage(imageSource(small)).then(analyse);
    p.catch(() => cache.delete(small));
    cache.set(small, p);
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

export const rgbCss = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;
