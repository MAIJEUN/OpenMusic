import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  DEFAULT_PALETTE,
  extractPalette,
  extractPaletteExact,
  paletteDistance,
  paletteFromPixels,
  rgbCss,
  videoFrameUrls,
  type Palette,
} from '../lib/palette';
import { spectrum } from '../player/spectrum';
import { useSpectrumState } from '../player/useSpectrum';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';

let applied: Palette | null = null;

function applyPalette(p: Palette, force = false) {
  // 비슷한 색으로는 바꾸지 않는다 (동영상 색이 미세하게 흔들리는 것 방지)
  if (!force && applied && paletteDistance(applied, p) < 18) return;
  applied = p;
  const root = document.documentElement.style;
  root.setProperty('--theme-1', rgbCss(p.primary));
  root.setProperty('--theme-2', rgbCss(p.secondary));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', rgbCss(p.secondary));
}

/**
 * 페이지 전체 색감(--theme-1, --theme-2)을 정한다.
 * - 기본: 지금 곡의 앨범 아트 색
 * - 플레이어 페이지에서 '동영상'을 보는 중:
 *   · 실시간 스펙트럼(탭 공유)이 켜져 있으면 공유 화면에서 동영상 영역을 실제로 읽어 실시간으로 따라감
 *   · 꺼져 있으면 YouTube 장면 썸네일(약 25/50/75% 지점)을 재생 위치에 맞춰 바꿔 씀
 * 실시간 스펙트럼이 켜져 있으면 배경 빛이 저음에 맞춰 숨쉰다.
 */
export function ThemeController() {
  const item = usePlayer((s) => s.queue[s.index]);
  const videoId = item?.track.videoId;
  const thumbnail = item?.track.thumbnail;
  const videoVisible = useUi((s) => s.nowPlayingOpen && s.npMode === 'video');
  const spectrumState = useSpectrumState();
  const ambientRef = useRef<HTMLDivElement>(null);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    api.config().then((c) => setMock(c.mock)).catch(() => {});
  }, []);

  const liveVideo = videoVisible && spectrumState === 'on' && !mock;
  const frameVideo = videoVisible && !liveVideo;

  // 동영상을 따라갈 때는 색 전환을 빠르게
  useEffect(() => {
    document.documentElement.classList.toggle('theme-fast', videoVisible);
  }, [videoVisible]);

  // 1) 앨범 아트 색
  useEffect(() => {
    if (videoVisible) return;
    let alive = true;
    if (!thumbnail) {
      applyPalette(DEFAULT_PALETTE, true);
      return;
    }
    extractPalette(thumbnail)
      .then((p) => alive && applyPalette(p, true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [thumbnail, videoVisible]);

  // 2) 동영상 장면 썸네일 (탭 공유 없이)
  useEffect(() => {
    if (!frameVideo || !videoId) return;
    let alive = true;
    let frames: (Palette | null)[] = [];
    let current = -1;
    const fallback = thumbnail ? extractPalette(thumbnail).catch(() => null) : Promise.resolve(null);

    Promise.all(videoFrameUrls(videoId, mock).map((u) => extractPaletteExact(u).catch(() => null))).then(async (list) => {
      if (!alive) return;
      frames = list;
      if (!list.some(Boolean)) {
        // 장면 썸네일이 없는 영상은 앨범 아트 색 유지
        const p = await fallback;
        if (alive && p) applyPalette(p, true);
        return;
      }
      update();
    });

    // 재생 위치에 해당하는 장면: 0~37.5% → 1번, ~62.5% → 2번, 그 뒤 → 3번
    const update = () => {
      const { position, duration } = usePlayer.getState();
      if (!frames.length || !duration) return;
      const r = position / duration;
      const idx = r < 0.375 ? 0 : r < 0.625 ? 1 : 2;
      if (idx === current) return;
      const p = frames[idx] ?? frames.find(Boolean);
      if (p) {
        current = idx;
        applyPalette(p, true);
      }
    };
    const unsub = usePlayer.subscribe(update);
    return () => {
      alive = false;
      unsub();
    };
  }, [frameVideo, videoId, thumbnail, mock]);

  // 3) 탭 공유 화면에서 동영상 영역을 실시간으로 읽기
  useEffect(() => {
    if (!liveVideo) return;
    const track = spectrum.videoTrack;
    const host = document.querySelector('.player-host') as HTMLElement | null;
    if (!track || !host) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => {});

    const W = 48;
    const H = 27;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const timer = setInterval(() => {
      if (!video.videoWidth || document.hidden) return;
      const r = host.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) return;
      // 탭 공유 화면은 현재 보이는 영역(뷰포트) 전체이므로 비율로 위치를 맞춘다
      const sx = video.videoWidth / window.innerWidth;
      const sy = video.videoHeight / window.innerHeight;
      try {
        ctx.drawImage(video, r.left * sx, r.top * sy, r.width * sx, r.height * sy, 0, 0, W, H);
        applyPalette(paletteFromPixels(ctx.getImageData(0, 0, W, H).data));
      } catch {
        /* 프레임이 아직 준비되지 않음 */
      }
    }, 500);

    return () => {
      clearInterval(timer);
      video.pause();
      video.srcObject = null;
    };
  }, [liveVideo]);

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
      el.style.opacity = String(0.6 + level * 0.4);
    });
  }, [spectrumState]);

  return <div ref={ambientRef} className="ambient" aria-hidden />;
}
