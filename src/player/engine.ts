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
  /** 다음 곡으로 크로스페이드 (지원하는 엔진만) */
  crossfade?(videoId: string, seconds: number, opts?: Omit<LoadOptions, 'autoplay'>): void;
  /** 동영상 위 YouTube 자막 표시 여부와 고른 자막 ID (지원하는 엔진만) */
  setCaptions?(on: boolean, trackId?: string): void;
  /** 지금 영상에서 고를 수 있는 자막 (자막이 켜져 있을 때만 채워짐) */
  getCaptionTracks?(): { tracks: VideoCaptionTrack[]; current?: string };
}

export interface VideoCaptionTrack {
  id: string;
  name: string;
  auto: boolean;
}

/* IFrame 플레이어의 공개되지 않은 자막 API (모듈 'captions' 또는 'cc') */
interface YtTrack {
  languageCode: string;
  languageName?: string;
  displayName?: string;
  kind?: string;
  vss_id?: string;
}
interface YtCaptionsApi {
  getOptions?: () => string[];
  loadModule?: (m: string) => void;
  unloadModule?: (m: string) => void;
  getOption?: (m: string, k: string) => unknown;
  setOption?: (m: string, k: string, v: unknown) => void;
}
const captionsModule = (p: YtCaptionsApi) => {
  const loaded = p.getOptions?.() ?? [];
  return loaded.includes('captions') ? 'captions' : loaded.includes('cc') ? 'cc' : null;
};
/** 같은 언어라도 직접 만든 자막(.ko)과 자동 생성 자막(a.ko)을 구분하는 ID */
const trackId = (t: YtTrack) => t.vss_id || `${t.kind === 'asr' ? 'a' : ''}.${t.languageCode}`;

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
  private captions = false;
  private captionTrack: string | undefined;
  private captionRetries = 0;

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
            cc_load_policy: 0,
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
            // 자막 모듈은 영상마다 새로 불려오므로 그때마다 설정을 다시 적용한다
            onApiChange: () => this.applyCaptions(),
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

  /**
   * 업로더가 '기본 자막'을 켜 둔 영상은 임베드 플레이어에서도 자막이 저절로 나온다.
   * 자막을 끈 상태면 자막 모듈을 내리고, 켠 상태면 모듈을 올려 고른 자막(없으면 직접 만든 자막)을 표시한다.
   */
  private applyCaptions() {
    const p = this.player as unknown as YtCaptionsApi | null;
    if (!p || !this.ready) return;
    try {
      const mod = captionsModule(p);
      if (!this.captions) {
        if (mod) p.unloadModule?.(mod);
        return;
      }
      if (!mod) {
        p.loadModule?.('captions');
        return;
      }
      const list = (p.getOption?.(mod, 'tracklist') as YtTrack[] | undefined) ?? [];
      if (!list.length) {
        // 자막 목록이 늦게 채워지는 경우가 있어 잠시 뒤 다시 확인
        if (this.captionRetries++ < 5) setTimeout(() => this.applyCaptions(), 800);
        return;
      }
      const cur = p.getOption?.(mod, 'track') as YtTrack | undefined;
      const curId = cur?.languageCode ? trackId(cur) : undefined;
      const want =
        list.find((t) => trackId(t) === this.captionTrack) ??
        (cur?.languageCode && cur.kind !== 'asr' ? cur : undefined) ??
        // 자동 생성 자막보다 직접 만든 자막을 먼저
        list.find((t) => t.kind !== 'asr') ??
        list[0];
      if (curId !== trackId(want)) p.setOption?.(mod, 'track', want);
    } catch {
      /* 플레이어 내부 API가 바뀌어도 재생에는 영향 없게 */
    }
  }

  setCaptions(on: boolean, trackId?: string) {
    this.captions = on;
    this.captionTrack = trackId;
    this.captionRetries = 0;
    this.applyCaptions();
  }

  getCaptionTracks() {
    const p = this.player as unknown as YtCaptionsApi | null;
    if (!p || !this.ready) return { tracks: [] };
    try {
      const mod = captionsModule(p);
      if (!mod) return { tracks: [] };
      const list = (p.getOption?.(mod, 'tracklist') as YtTrack[] | undefined) ?? [];
      const cur = p.getOption?.(mod, 'track') as YtTrack | undefined;
      const tracks = list.map((t) => ({
        id: trackId(t),
        name: t.displayName || t.languageName || t.languageCode,
        auto: t.kind === 'asr',
      }));
      return {
        tracks: [...tracks.filter((t) => !t.auto), ...tracks.filter((t) => t.auto)],
        current: cur?.languageCode ? trackId(cur) : undefined,
      };
    } catch {
      return { tracks: [] };
    }
  }

  load(videoId: string, opts: LoadOptions) {
    if (!this.player || !this.ready) {
      this.pending = { videoId, opts };
      return;
    }
    this.captionRetries = 0;
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
  private captions: { on: boolean; track?: string } = { on: false };

  constructor(private events: EngineEvents = noopEvents) {}

  setCaptions(on: boolean, trackId?: string) {
    this.captions = { on, track: trackId };
  }
  getCaptionTracks() {
    if (!this.captions.on) return { tracks: [] };
    const tracks = [
      { id: '.ko', name: '한국어', auto: false },
      { id: '.en', name: '영어', auto: false },
      { id: 'a.ko', name: '한국어 (자동 생성됨)', auto: true },
    ];
    return { tracks, current: tracks.find((t) => t.id === this.captions.track)?.id ?? '.ko' };
  }

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
    // 실제 YouTube 플레이어처럼 seek가 약간 늦게 반영되도록 흉내낸다 (그동안 getTime은 예전 값)
    const t = Math.min(Math.max(0, seconds), this.duration);
    if (!this.playing) this.time = t;
    else setTimeout(() => (this.time = t), 350);
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

/* ------------------------------------------------------------------ */

/**
 * 플레이어 두 개를 번갈아 쓰는 엔진 (크로스페이드용).
 * 평소에는 '활성' 플레이어만 쓰고, crossfade()가 불리면 쉬고 있던 플레이어로 다음 곡을 틀어
 * 두 플레이어의 볼륨을 엇갈리게 바꾼 뒤 활성 플레이어를 넘긴다.
 * 활성 플레이어의 이벤트만 바깥(스토어)으로 전달한다.
 */
export class DualEngine implements Engine {
  private players: [Engine, Engine];
  private slots: HTMLElement[] = [];
  private active = 0;
  private volume = 100;
  private muted = false;
  private fade: { timer: ReturnType<typeof setInterval> | null; wait: ReturnType<typeof setTimeout> | null; from: number } | null = null;
  /** 크로스페이드 중 새 플레이어가 재생을 시작했는지 */
  private nextStarted: (() => void) | null = null;

  constructor(
    create: (events: EngineEvents) => Engine,
    private events: EngineEvents = noopEvents,
  ) {
    const forward = (i: number): EngineEvents => ({
      onState: (s) => {
        if (s === 'playing' && i !== this.active) return;
        if (i === this.active) {
          if (s === 'playing' && this.nextStarted) {
            const cb = this.nextStarted;
            this.nextStarted = null;
            cb();
          }
          this.events.onState(s);
        }
      },
      onError: (code) => i === this.active && this.events.onError(code),
      onFatal: (msg) => i === this.active && this.events.onFatal(msg),
    });
    this.players = [create(forward(0)), create(forward(1))];
  }

  mount(el: HTMLElement) {
    this.players.forEach((p, i) => {
      const slot = document.createElement('div');
      slot.className = `player-slot ${i === this.active ? 'player-slot--active' : ''}`;
      el.appendChild(slot);
      this.slots.push(slot);
      p.mount(slot);
    });
  }

  private get cur() {
    return this.players[this.active];
  }

  private applyVolume(p: Engine, v: number) {
    p.setVolume(Math.round(v));
    p.setMuted(this.muted);
  }

  /** 진행 중인 크로스페이드를 멈추고 이전 곡 플레이어를 정리한다 */
  private cancelFade() {
    if (!this.fade) return;
    if (this.fade.timer) clearInterval(this.fade.timer);
    if (this.fade.wait) clearTimeout(this.fade.wait);
    const old = this.players[this.fade.from];
    old.pause();
    this.applyVolume(old, this.volume);
    this.applyVolume(this.cur, this.volume);
    this.fade = null;
    this.nextStarted = null;
  }

  private setActive(i: number) {
    this.active = i;
    this.slots.forEach((s, j) => s.classList.toggle('player-slot--active', j === i));
  }

  load(videoId: string, opts: LoadOptions) {
    this.cancelFade();
    this.applyVolume(this.cur, this.volume);
    this.cur.load(videoId, opts);
  }

  /**
   * 다음 곡을 쉬고 있던 플레이어로 틀고, seconds초 동안 두 곡의 볼륨을 엇갈리게 바꾼다.
   * 호출 즉시 새 플레이어가 활성 플레이어가 된다 (시간·상태는 새 곡 기준).
   */
  crossfade(videoId: string, seconds: number, opts: Omit<LoadOptions, 'autoplay'> = {}) {
    this.cancelFade();
    const from = this.active;
    const to = 1 - from;
    const oldP = this.players[from];
    const newP = this.players[to];
    this.applyVolume(newP, 0);
    this.setActive(to);
    const fade: NonNullable<DualEngine['fade']> = { timer: null, wait: null, from };
    this.fade = fade;

    const begin = () => {
      if (this.fade !== fade) return;
      if (fade.wait) clearTimeout(fade.wait);
      const startAt = performance.now();
      const total = Math.max(0.2, seconds) * 1000;
      fade.timer = setInterval(() => {
        const t = Math.min(1, (performance.now() - startAt) / total);
        // 등전력 곡선: 중간에 소리가 꺼지는 느낌 없이 자연스럽게 섞인다
        this.applyVolume(oldP, this.volume * Math.cos((t * Math.PI) / 2));
        this.applyVolume(newP, this.volume * Math.sin((t * Math.PI) / 2));
        if (t >= 1) {
          if (fade.timer) clearInterval(fade.timer);
          oldP.pause();
          this.applyVolume(oldP, this.volume);
          this.applyVolume(newP, this.volume);
          if (this.fade === fade) this.fade = null;
        }
      }, 50);
    };
    // 새 곡이 실제로 재생을 시작하면 페이드 시작 (늦어지면 4초 뒤 강제로 시작)
    this.nextStarted = begin;
    fade.wait = setTimeout(() => {
      this.nextStarted = null;
      begin();
    }, 4000);
    newP.load(videoId, { ...opts, autoplay: true, start: opts.start ?? 0 });
  }

  play() {
    this.cur.play();
  }
  pause() {
    // 크로스페이드 중에 멈추면 이전 곡도 함께 정리
    this.cancelFade();
    this.cur.pause();
  }
  seek(seconds: number) {
    this.cur.seek(seconds);
  }
  setVolume(volume: number) {
    this.volume = volume;
    if (!this.fade) this.applyVolume(this.cur, volume);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.players.forEach((p) => p.setMuted(muted));
  }
  setCaptions(on: boolean, trackId?: string) {
    this.players.forEach((p) => p.setCaptions?.(on, trackId));
  }
  getCaptionTracks() {
    return this.cur.getCaptionTracks?.() ?? { tracks: [] };
  }
  getTime() {
    return this.cur.getTime();
  }
  getDuration() {
    return this.cur.getDuration();
  }
}
