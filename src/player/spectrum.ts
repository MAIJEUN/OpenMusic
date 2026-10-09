/**
 * 실시간 오디오 스펙트럼.
 *
 * YouTube 플레이어는 다른 출처(iframe)라서 Web Audio로 직접 소리를 읽을 수 없다.
 * 그래서 브라우저의 "탭 공유"(getDisplayMedia)로 이 탭의 오디오를 받아 AnalyserNode로 분석한다.
 * 사용자가 공유를 허락해야 하며, 데스크톱 Chrome/Edge에서 동작한다.
 * 목 데이터 모드에서는 탭 공유 대신 테스트 신호를 분석한다.
 */

export type SpectrumState = 'off' | 'starting' | 'on';
type FrameListener = (freq: Uint8Array, sampleRate: number) => void;

class Spectrum {
  state: SpectrumState = 'off';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private freq = new Uint8Array(0);
  private stateListeners = new Set<() => void>();
  private frameListeners = new Set<FrameListener>();
  private raf = 0;
  private testGain: GainNode | null = null;

  /** 탭 오디오 캡처를 지원하는 브라우저인지 */
  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  }

  subscribeState = (fn: () => void) => {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  };

  getState = () => this.state;

  private setState(state: SpectrumState) {
    this.state = state;
    this.stateListeners.forEach((fn) => fn());
    this.updateLoop();
  }

  /** 매 프레임 주파수 데이터를 받는다 (스펙트럼이 켜져 있을 때만 호출됨) */
  onFrame(fn: FrameListener) {
    this.frameListeners.add(fn);
    this.updateLoop();
    return () => {
      this.frameListeners.delete(fn);
      this.updateLoop();
    };
  }

  private updateLoop() {
    const shouldRun = this.state === 'on' && this.frameListeners.size > 0;
    if (shouldRun && !this.raf) {
      const loop = () => {
        if (this.analyser && this.ctx) {
          this.analyser.getByteFrequencyData(this.freq);
          const rate = this.ctx.sampleRate;
          this.frameListeners.forEach((fn) => fn(this.freq, rate));
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private setupAnalyser(ctx: AudioContext) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -20;
    // 일부 브라우저는 출력에 연결되지 않은 노드를 처리하지 않으므로, 소리 0으로 출력에 연결해 둔다
    const mute = ctx.createGain();
    mute.gain.value = 0;
    analyser.connect(mute).connect(ctx.destination);
    this.analyser = analyser;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    return analyser;
  }

  /** 이 탭의 오디오를 캡처해서 분석을 시작한다 (사용자 클릭에서 호출해야 함) */
  async start(): Promise<void> {
    if (this.state !== 'off') return;
    if (!this.supported) throw new Error('이 브라우저는 탭 오디오 캡처를 지원하지 않습니다. 데스크톱 Chrome 또는 Edge를 사용해 주세요.');
    this.setState('starting');
    try {
      const options = {
        video: { displaySurface: 'browser', frameRate: 1 },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
        },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'include',
      } as DisplayMediaStreamOptions;
      const stream = await navigator.mediaDevices.getDisplayMedia(options);
      const audio = stream.getAudioTracks()[0];
      // 영상은 필요 없으므로 바로 끈다
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!audio) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("공유 창에서 '이 탭'을 고르고 '탭 오디오도 공유'를 켜 주세요.");
      }
      audio.addEventListener('ended', () => this.stop());
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([audio]));
      source.connect(this.setupAnalyser(ctx)); // 분석만 하고 다시 재생하지 않는다 (소리는 원래대로 나옴)
      this.ctx = ctx;
      this.stream = stream;
      this.setState('on');
    } catch (err) {
      this.cleanup();
      this.setState('off');
      const e = err as DOMException;
      if (e.name === 'NotAllowedError') throw new Error('탭 공유가 취소되었습니다.');
      throw err;
    }
  }

  /** 목 데이터 모드용: 재생 상태에 따라 켜지고 꺼지는 테스트 신호를 분석한다 */
  startTestSignal() {
    if (this.state !== 'off') return;
    const ctx = new AudioContext();
    const analyser = this.setupAnalyser(ctx);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(analyser);
    // 저음 킥 + 화음 + 노이즈를 LFO로 흔들어 음악처럼 움직이게 한다
    const voices: [OscillatorType, number, number][] = [
      ['sine', 55, 1],
      ['sawtooth', 220, 0.25],
      ['triangle', 330, 0.3],
      ['square', 880, 0.08],
      ['sawtooth', 1760, 0.05],
    ];
    voices.forEach(([type, freq, level], i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7 + i * 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = level * 0.9;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(gain);
      osc.start();
      lfo.start();
    });
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
    noise.buffer = buf;
    noise.loop = true;
    noise.connect(gain);
    noise.start();
    this.ctx = ctx;
    this.testGain = gain;
    this.setState('on');
  }

  /** 목 데이터 모드에서 재생/일시정지에 맞춰 테스트 신호를 켜고 끈다 */
  setTestSignalActive(active: boolean) {
    if (this.testGain && this.ctx) this.testGain.gain.setTargetAtTime(active ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  stop() {
    if (this.state === 'off') return;
    this.cleanup();
    this.setState('off');
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.testGain = null;
  }
}

export const spectrum = new Spectrum();

/**
 * 주파수 데이터를 로그 간격의 n개 대역(0~1)으로 묶는다.
 * 사람 귀처럼 저음은 좁게, 고음은 넓게 나눈다.
 */
export function toBands(freq: Uint8Array, sampleRate: number, n: number, out: Float32Array, minHz = 40, maxHz = 16000) {
  const binHz = sampleRate / 2 / freq.length;
  const logMin = Math.log(minHz);
  const logMax = Math.log(maxHz);
  for (let b = 0; b < n; b++) {
    const lo = Math.exp(logMin + ((logMax - logMin) * b) / n);
    const hi = Math.exp(logMin + ((logMax - logMin) * (b + 1)) / n);
    let start = Math.floor(lo / binHz);
    let end = Math.max(start + 1, Math.ceil(hi / binHz));
    start = Math.min(start, freq.length - 1);
    end = Math.min(end, freq.length);
    let peak = 0;
    for (let i = start; i < end; i++) if (freq[i] > peak) peak = freq[i];
    out[b] = peak / 255;
  }
  return out;
}
