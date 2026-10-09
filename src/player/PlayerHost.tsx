import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { artistNames } from '../lib/format';
import { thumbSize } from '../lib/thumb';
import { attachEngine, usePlayer } from '../store/player';
import { toast, useUi } from '../store/ui';
import { FakeEngine, YouTubeEngine, type Engine, type EngineEvents } from './engine';
import { anchorPause, anchorPlay } from './mediaAnchor';

const HIDDEN: Partial<CSSStyleDeclaration> = {
  left: '0px',
  top: '0px',
  width: '200px',
  height: '200px',
  opacity: '0',
  pointerEvents: 'none',
  zIndex: '-1',
};

/**
 * 플레이어 iframe을 한 번만 만들고 계속 유지한다 (DOM 이동 시 iframe이 다시 로드되므로).
 * '지금 재생 중' 화면에서 동영상 모드일 때는 지정된 슬롯 위치에 겹쳐 보여준다.
 */
export function PlayerHost() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);

  // 엔진 생성
  useEffect(() => {
    let cancelled = false;
    const events: EngineEvents = {
      onState: (s) => usePlayer.getState()._onEngineState(s),
      onError: (code) => usePlayer.getState()._onEngineError(code),
      onFatal: (msg) => toast(msg),
    };
    api
      .config()
      .catch(() => ({ mock: false }))
      .then((cfg) => {
        if (cancelled || engineRef.current || !hostRef.current) return;
        const engine: Engine = cfg.mock ? new FakeEngine(events) : new YouTubeEngine(events);
        engine.mount(hostRef.current);
        const { volume, muted, queue, index, position } = usePlayer.getState();
        engine.setVolume(volume);
        engine.setMuted(muted);
        engineRef.current = engine;
        attachEngine(engine);
        // 새로고침 후 마지막 곡을 대기 상태로 준비
        const item = queue[index];
        if (item) engine.load(item.track.videoId, { autoplay: false, start: position, durationHint: item.track.duration });
      });
    const tick = setInterval(() => usePlayer.getState()._tick(), 250);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  // 동영상 슬롯 위치 동기화
  const slot = useUi((s) => s.videoSlot);
  const visible = useUi((s) => s.nowPlayingOpen && s.npMode === 'video');
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!slot || !visible) {
      Object.assign(host.style, HIDDEN);
      return;
    }
    let raf = 0;
    const sync = () => {
      const r = slot.getBoundingClientRect();
      Object.assign(host.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        opacity: '1',
        pointerEvents: 'none',
        zIndex: '41',
      });
      raf = requestAnimationFrame(sync);
    };
    sync();
    return () => cancelAnimationFrame(raf);
  }, [slot, visible]);

  useMediaSession();
  useDocumentTitle();

  return <div ref={hostRef} className="player-host" aria-hidden />;
}

function useDocumentTitle() {
  const item = usePlayer((s) => s.queue[s.index]);
  const status = usePlayer((s) => s.status);
  useEffect(() => {
    if (item && status !== 'idle') {
      document.title = `${item.track.title} - ${artistNames(item.track.artists) || 'OpenMusic'}`;
    } else {
      document.title = 'OpenMusic';
    }
  }, [item, status]);
}

function useMediaSession() {
  const item = usePlayer((s) => s.queue[s.index]);
  const status = usePlayer((s) => s.status);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const p = () => usePlayer.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => p().play()],
      ['pause', () => p().pause()],
      ['previoustrack', () => p().prev()],
      ['nexttrack', () => p().next()],
      ['seekto', (d) => d.seekTime !== undefined && p().seek(d.seekTime)],
      ['seekbackward', (d) => p().seekBy(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => p().seekBy(d.seekOffset ?? 10)],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* 지원하지 않는 액션 */
      }
    }
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !item) return;
    const t = item.track;
    const art = t.thumbnail;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: artistNames(t.artists),
      album: t.album?.name ?? '',
      artwork: art
        ? [96, 256, 512].map((s) => ({ src: thumbSize(art, s) ?? art, sizes: `${s}x${s}` }))
        : [],
    });
  }, [item]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const active = status === 'playing' || status === 'buffering' || status === 'loading';
    navigator.mediaSession.playbackState = active ? 'playing' : status === 'idle' ? 'none' : 'paused';
    // 시스템 미디어 컨트롤이 YouTube iframe이 아니라 이 페이지에 연결되도록 무음 오디오를 함께 재생
    if (active) anchorPlay();
    else anchorPause();
  }, [status]);

  // 시스템 미디어 컨트롤의 진행 막대(재생 위치/길이)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    let last = { position: -10, duration: 0, status: '' };
    const update = () => {
      const { position, duration, status } = usePlayer.getState();
      if (!duration || duration < 1) return;
      // 상태·길이가 바뀌었거나, 위치가 예상과 2초 이상 어긋날 때(탐색 등)만 갱신
      const jumped = Math.abs(position - last.position) > 2;
      if (status === last.status && duration === last.duration && !jumped) {
        last.position = position;
        return;
      }
      last = { position, duration, status };
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(Math.max(0, position), duration),
          playbackRate: 1,
        });
      } catch {
        /* 잘못된 값 무시 */
      }
    };
    update();
    return usePlayer.subscribe(update);
  }, []);
}
