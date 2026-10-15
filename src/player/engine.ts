/**
 * 실제 재생을 담당하는 엔진.
 * - YouTubeEngine: YouTube IFrame Player API (정식 임베드 플레이어)
 * - SoundCloudEngine: SoundCloud 임베드 플레이어 (Widget API)
 * - SwitchEngine: 곡에 따라 YouTube/SoundCloud 플레이어를 골라 쓴다
 * - FakeEngine: 목 데이터 모드에서 타이머로 재생을 흉내낸다
 */

import { onTrackGainChange, trackGain } from './trackGain';

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
}

/* IFrame 플레이어의 공개되지 않은 자막 API (모듈 'captions' 또는 'cc') */
interface YtCaptionsApi {
  getOptions?: () => string[];
  unloadModule?: (m: string) => void;
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
  /** 지금 틀고 있는 영상 (곡별 볼륨 균형 배율) */
  private videoId: string | null = null;

  constructor(private events: EngineEvents = noopEvents) {
    onTrackGainChange(() => this.applyVolume());
  }

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
            // 자막 이름 등 플레이어 글자를 한국어로
            hl: 'ko',
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
            // 자막 모듈은 영상마다 새로 불려오므로 그때마다 다시 내린다
            onApiChange: () => this.hideCaptions(),
            onError: (e) => this.events.onError(Number(e.data)),
          },
        });
      })
      .catch((err: Error) => this.events.onFatal(err.message));
  }

  private applyVolume() {
    if (!this.player || !this.ready) return;
    this.player.setVolume(Math.min(100, Math.round(this.volume * trackGain(this.videoId))));
    if (this.muted) this.player.mute();
    else this.player.unMute();
  }

  /** 업로더가 '기본 자막'을 켜 둔 영상은 임베드 플레이어에서도 자막이 저절로 나오므로 자막 모듈을 내린다 */
  private hideCaptions() {
    const p = this.player as unknown as YtCaptionsApi | null;
    if (!p || !this.ready) return;
    try {
      const loaded = p.getOptions?.() ?? [];
      for (const m of ['captions', 'cc']) if (loaded.includes(m)) p.unloadModule?.(m);
    } catch {
      /* 플레이어 내부 API가 바뀌어도 재생에는 영향 없게 */
    }
  }

  load(videoId: string, opts: LoadOptions) {
    if (!this.player || !this.ready) {
      this.pending = { videoId, opts };
      return;
    }
    this.videoId = videoId;
    this.applyVolume();
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

/* SoundCloud 임베드 플레이어(Widget API) — https://developers.soundcloud.com/docs/api/html5-widget */
interface ScWidget {
  bind(event: string, cb: (e?: { currentPosition?: number }) => void): void;
  unbind(event: string): void;
  load(url: string, opts: Record<string, unknown> & { callback?: () => void }): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  setVolume(v: number): void;
  getDuration(cb: (ms: number) => void): void;
}
interface ScApi {
  Widget: ((el: HTMLIFrameElement) => ScWidget) & {
    Events: Record<'READY' | 'PLAY' | 'PAUSE' | 'FINISH' | 'PLAY_PROGRESS' | 'ERROR', string>;
  };
}
declare global {
  interface Window {
    SC?: ScApi;
  }
}

let scApiPromise: Promise<ScApi> | null = null;
function loadScApi(): Promise<ScApi> {
  if (window.SC?.Widget) return Promise.resolve(window.SC);
  if (scApiPromise) return scApiPromise;
  scApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    script.onload = () => (window.SC ? resolve(window.SC) : reject(new Error('SoundCloud 플레이어를 불러오지 못했습니다.')));
    script.onerror = () => {
      scApiPromise = null;
      reject(new Error('SoundCloud 플레이어 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });
  return scApiPromise;
}

const scTrackUrl = (videoId: string) => `https://api.soundcloud.com/tracks/${videoId.replace(/^sc:/, '')}`;
const SC_PARAMS = 'auto_play=false&visual=true&show_artwork=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&buying=false&sharing=false&download=false';

/** SoundCloud 곡 재생 (공식 임베드 플레이어) */
export class SoundCloudEngine implements Engine {
  private el: HTMLElement | null = null;
  private widget: ScWidget | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private loading: { videoId: string; opts: LoadOptions } | null = null;
  private volume = 100;
  private muted = false;
  private time = 0;
  /** 마지막 재생 위치를 받은 시각 (그 사이 시간은 직접 흘려서 가사가 부드럽게 움직이게) */
  private timeAt = 0;
  private playing = false;
  private duration = 0;
  /** 로드 직후 처음 재생될 때 옮겨 갈 위치(초) */
  private startAt = 0;
  /** 로드마다 늘어나는 번호 (이전 곡의 늦은 이벤트 무시) */
  private gen = 0;
  private videoId: string | null = null;

  constructor(private events: EngineEvents = noopEvents) {
    onTrackGainChange(() => this.applyVolume());
  }

  mount(el: HTMLElement) {
    this.el = el;
  }

  private bindAll(SC: ScApi, w: ScWidget, gen: number) {
    const E = SC.Widget.Events;
    for (const ev of Object.values(E)) w.unbind(ev);
    const live = () => gen === this.gen;
    w.bind(E.PLAY, () => {
      if (!live()) return;
      this.playing = true;
      this.timeAt = performance.now();
      if (this.startAt > 0) {
        w.seekTo(this.startAt * 1000);
        this.time = this.startAt;
        this.startAt = 0;
      }
      w.getDuration((ms) => live() && ms > 0 && (this.duration = ms / 1000));
      this.events.onState('playing');
    });
    w.bind(E.PAUSE, () => {
      if (!live()) return;
      this.time = this.getTime();
      this.playing = false;
      this.events.onState('paused');
    });
    w.bind(E.FINISH, () => {
      if (!live()) return;
      this.playing = false;
      this.time = this.duration;
      this.events.onState('ended');
    });
    w.bind(E.PLAY_PROGRESS, (e) => {
      if (!live() || typeof e?.currentPosition !== 'number') return;
      this.time = e.currentPosition / 1000;
      this.timeAt = performance.now();
    });
    w.bind(E.ERROR, () => live() && this.events.onError(100));
  }

  private applyVolume() {
    this.widget?.setVolume(this.muted ? 0 : Math.min(100, Math.round(this.volume * trackGain(this.videoId))));
  }

  /** 불러온 곡이 준비되면 */
  private onLoaded(SC: ScApi, gen: number, autoplay: boolean) {
    if (gen !== this.gen || !this.widget) return;
    this.bindAll(SC, this.widget, gen);
    this.applyVolume();
    this.widget.getDuration((ms) => gen === this.gen && ms > 0 && (this.duration = ms / 1000));
    if (autoplay) this.widget.play();
    else this.events.onState('cued');
  }

  load(videoId: string, opts: LoadOptions) {
    const gen = ++this.gen;
    this.videoId = videoId;
    this.time = opts.start ?? 0;
    this.timeAt = performance.now();
    this.startAt = opts.start ?? 0;
    this.playing = false;
    this.duration = opts.durationHint ?? 0;
    this.loading = { videoId, opts };
    this.events.onState(opts.autoplay ? 'buffering' : 'cued');
    loadScApi()
      .then((SC) => {
        if (gen !== this.gen || !this.el) return;
        const url = scTrackUrl(videoId);
        if (!this.widget) {
          // 첫 곡: 그 곡 주소로 임베드 플레이어를 만든다
          const iframe = document.createElement('iframe');
          iframe.allow = 'autoplay; encrypted-media';
          iframe.title = 'SoundCloud';
          iframe.style.cssText = 'width:100%;height:100%;border:0;display:block';
          iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&${SC_PARAMS}`;
          this.el.appendChild(iframe);
          this.iframe = iframe;
          const w = SC.Widget(iframe);
          this.widget = w;
          w.bind(SC.Widget.Events.READY, () => {
            w.unbind(SC.Widget.Events.READY);
            this.onLoaded(SC, this.gen, this.loading?.opts.autoplay ?? false);
          });
        } else {
          this.widget.load(url, {
            auto_play: false,
            visual: true,
            show_artwork: true,
            hide_related: true,
            show_comments: false,
            show_teaser: false,
            callback: () => this.onLoaded(SC, gen, opts.autoplay),
          });
        }
      })
      .catch((err: Error) => gen === this.gen && this.events.onFatal(err.message));
  }

  play() {
    this.widget?.play();
  }
  pause() {
    this.widget?.pause();
  }
  seek(seconds: number) {
    this.time = Math.max(0, seconds);
    this.timeAt = performance.now();
    if (!this.playing) this.startAt = this.time;
    this.widget?.seekTo(this.time * 1000);
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
    if (!this.playing) return this.time;
    const t = this.time + (performance.now() - this.timeAt) / 1000;
    return this.duration ? Math.min(t, this.duration) : t;
  }
  getDuration() {
    return this.duration;
  }
  /** iframe 보이기/숨기기 (YouTube 곡을 틀 때는 숨긴다) */
  get frame() {
    return this.iframe;
  }
}

/* ------------------------------------------------------------------ */

/**
 * 곡 ID에 따라 YouTube 플레이어와 SoundCloud 플레이어 중 하나로 트는 엔진.
 * 지금 쓰는 플레이어의 이벤트만 바깥으로 전달한다.
 */
export class SwitchEngine implements Engine {
  private yt: Engine;
  private sc: SoundCloudEngine;
  private useSc = false;
  private boxes: HTMLElement[] = [];

  constructor(createYouTube: (events: EngineEvents) => Engine, events: EngineEvents = noopEvents) {
    const gate = (sc: boolean): EngineEvents => ({
      onState: (st) => this.useSc === sc && events.onState(st),
      onError: (c) => this.useSc === sc && events.onError(c),
      onFatal: (m) => this.useSc === sc && events.onFatal(m),
    });
    this.yt = createYouTube(gate(false));
    this.sc = new SoundCloudEngine(gate(true));
  }

  mount(el: HTMLElement) {
    for (const [i, e] of [this.yt, this.sc].entries()) {
      const box = document.createElement('div');
      box.className = 'engine-box';
      box.style.cssText = `position:absolute;inset:0;${i === 1 ? 'visibility:hidden' : ''}`;
      el.appendChild(box);
      this.boxes.push(box);
      e.mount(box);
    }
  }

  private get cur(): Engine {
    return this.useSc ? this.sc : this.yt;
  }

  load(videoId: string, opts: LoadOptions) {
    const sc = videoId.startsWith('sc:');
    if (sc !== this.useSc) {
      this.cur.pause();
      this.useSc = sc;
      this.boxes.forEach((b, i) => (b.style.visibility = (i === 1) === sc ? '' : 'hidden'));
    }
    this.cur.load(videoId, opts);
  }
  play() {
    this.cur.play();
  }
  pause() {
    this.cur.pause();
  }
  seek(seconds: number) {
    this.cur.seek(seconds);
  }
  setVolume(volume: number) {
    this.yt.setVolume(volume);
    this.sc.setVolume(volume);
  }
  setMuted(muted: boolean) {
    this.yt.setMuted(muted);
    this.sc.setMuted(muted);
  }
  getTime() {
    return this.cur.getTime();
  }
  getDuration() {
    return this.cur.getDuration();
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

  constructor(private events: EngineEvents = noopEvents) {
    onTrackGainChange(() => this.showVolume());
  }

  mount(el: HTMLElement) {
    this.el = el;
    el.innerHTML =
      '<div style="width:100%;height:100%;display:grid;place-items:center;background:#111;color:#777;font:14px sans-serif">목 데이터 모드 · 동영상 미리보기 없음</div>';
  }

  private volume = 100;
  private videoId: string | null = null;
  /** 실제 소리는 없지만 확인용으로 적용된 볼륨을 화면 요소에 남긴다 */
  private showVolume() {
    if (this.el) this.el.dataset.volume = String(Math.min(100, Math.round(this.volume * trackGain(this.videoId))));
  }

  load(videoId: string, opts: LoadOptions) {
    this.videoId = videoId;
    this.showVolume();
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
  setVolume(volume: number) {
    this.volume = volume;
    this.showVolume();
  }
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
  getTime() {
    return this.cur.getTime();
  }
  getDuration() {
    return this.cur.getDuration();
  }
}
