/**
 * 실제 재생을 담당하는 엔진.
 * - YouTubeEngine: YouTube IFrame Player API (정식 임베드 플레이어)
 * - FakeEngine: 목 데이터 모드에서 타이머로 재생을 흉내낸다
 */

export type EngineState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'cued';

export interface EngineEvents {
  onState: (state: EngineState) => void;
  onError: (code: number) => void;
  onFatal: (message: string) => void;
}

export interface LoadOptions {
  autoplay: boolean;
  start?: number;
  durationHint?: number;
}

export interface Engine {
  mount(el: HTMLElement): void;
  load(videoId: string, opts: LoadOptions): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  getTime(): number;
  getDuration(): number;
}

const noopEvents: EngineEvents = { onState: () => {}, onError: () => {}, onFatal: () => {} };

/* ------------------------------------------------------------------ */

let apiPromise: Promise<typeof YT> | null = null;

function loadIframeApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube 플레이어 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('YouTube 플레이어 로딩 시간이 초과되었습니다.')), 20_000);
  });
  return apiPromise;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

export class YouTubeEngine implements Engine {
  private player: YT.Player | null = null;
  private ready = false;
  private pending: { videoId: string; opts: LoadOptions } | null = null;
  private volume = 100;
  private muted = false;

  constructor(private events: EngineEvents = noopEvents) {}

  mount(el: HTMLElement) {
    if (this.player) return;
    const target = document.createElement('div');
    el.appendChild(target);
    loadIframeApi()
      .then((YTApi) => {
        this.player = new YTApi.Player(target, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            origin: location.origin,
          },
          events: {
            onReady: () => {
              this.ready = true;
              this.applyVolume();
              if (this.pending) {
                const { videoId, opts } = this.pending;
                this.pending = null;
                this.load(videoId, opts);
              }
            },
            onStateChange: (e) => this.events.onState(mapState(e.data)),
            onError: (e) => this.events.onError(Number(e.data)),
          },
        });
      })
      .catch((err: Error) => this.events.onFatal(err.message));
  }

  private applyVolume() {
    if (!this.player || !this.ready) return;
    this.player.setVolume(this.volume);
    if (this.muted) this.player.mute();
    else this.player.unMute();
  }

  load(videoId: string, opts: LoadOptions) {
    if (!this.player || !this.ready) {
      this.pending = { videoId, opts };
      return;
    }
    const args = { videoId, startSeconds: Math.max(0, Math.floor(opts.start ?? 0)) };
    if (opts.autoplay) this.player.loadVideoById(args);
    else this.player.cueVideoById(args);
  }

  play() {
    if (this.ready) this.player?.playVideo();
  }
  pause() {
    if (this.ready) this.player?.pauseVideo();
  }
  seek(seconds: number) {
    if (this.ready) this.player?.seekTo(seconds, true);
  }
  setVolume(volume: number) {
    this.volume = volume;
    this.applyVolume();
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyVolume();
  }
  getTime() {
    return this.ready ? (this.player?.getCurrentTime?.() ?? 0) : 0;
  }
  getDuration() {
    return this.ready ? (this.player?.getDuration?.() ?? 0) : 0;
  }
}

function mapState(code: number): EngineState {
  switch (code) {
    case 0:
      return 'ended';
    case 1:
      return 'playing';
    case 2:
      return 'paused';
    case 3:
      return 'buffering';
    case 5:
      return 'cued';
    default:
      return 'unstarted';
  }
}

/* ------------------------------------------------------------------ */

/** 네트워크 없이 UI를 확인하기 위한 가짜 엔진 */
export class FakeEngine implements Engine {
  private time = 0;
  private duration = 0;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private el: HTMLElement | null = null;

  constructor(private events: EngineEvents = noopEvents) {}

  mount(el: HTMLElement) {
    this.el = el;
    el.innerHTML =
      '<div style="width:100%;height:100%;display:grid;place-items:center;background:#111;color:#777;font:14px sans-serif">목 데이터 모드 · 동영상 미리보기 없음</div>';
  }

  load(_videoId: string, opts: LoadOptions) {
    void this.el;
    this.time = opts.start ?? 0;
    this.duration = opts.durationHint ?? 200;
    this.stopTimer();
    this.playing = false;
    if (opts.autoplay) {
      this.events.onState('buffering');
      setTimeout(() => this.play(), 300);
    } else {
      this.events.onState('cued');
    }
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.events.onState('playing');
    this.timer = setInterval(() => {
      this.time += 0.25;
      if (this.time >= this.duration) {
        this.time = this.duration;
        this.stopTimer();
        this.playing = false;
        this.events.onState('ended');
      }
    }, 250);
  }

  pause() {
    this.stopTimer();
    if (this.playing) {
      this.playing = false;
      this.events.onState('paused');
    }
  }

  seek(seconds: number) {
    this.time = Math.min(Math.max(0, seconds), this.duration);
  }
  setVolume() {}
  setMuted() {}
  getTime() {
    return this.time;
  }
  getDuration() {
    return this.duration;
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
