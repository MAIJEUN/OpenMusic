/**
 * 스펙트럼 값을 '살아 있게' 만드는 후처리.
 * - 자동 범위: 최근 값의 범위(바닥~천장)를 계속 따라가며 0~1로 다시 펼친다.
 *   시끄러운 곡에서 값이 위쪽에 몰려 멈춰 보이는 것을 막는다.
 * - 빠른 상승 / 빠른 하강: 비트가 칠 때 바로 튀고, 금방 떨어진다.
 *
 * mode
 * - 'shape'(그래프용): 전체 대역이 천장 하나를 공유해 스펙트럼 모양(저음/고음 비율)은 유지
 * - 'range'(작은 막대용): 대역마다 바닥/천장을 따로 둬서 막대마다 크게 움직임
 */
export class Reactive {
  private level: Float32Array;
  private lo: Float32Array;
  private hi: Float32Array;

  constructor(
    size: number,
    private opts: { mode?: 'shape' | 'range'; attack?: number; release?: number } = {},
  ) {
    this.level = new Float32Array(size);
    const k = opts.mode === 'range' ? size : 1;
    this.lo = new Float32Array(k);
    this.hi = new Float32Array(k).fill(0.3);
  }

  update(input: Float32Array): Float32Array {
    const { mode = 'shape', attack = 0.85, release = 0.5 } = this.opts;
    const n = this.level.length;

    if (mode === 'shape') {
      let max = 0;
      for (let i = 0; i < n; i++) if (input[i] > max) max = input[i];
      // 천장: 큰 값엔 빠르게 올라가고 조용해지면 천천히 내려옴. 약간 여유를 둬서 항상 꽉 차지 않게
      const target = max * 1.1;
      this.hi[0] = target > this.hi[0] ? this.hi[0] + (target - this.hi[0]) * 0.5 : Math.max(0.15, this.hi[0] * 0.995);
    }

    for (let i = 0; i < n; i++) {
      const x = input[i];
      let v: number;
      if (mode === 'range') {
        // 바닥은 빨리 내려가고 천천히 올라감, 천장은 빨리 올라가고 천천히 내려감
        this.lo[i] += (x - this.lo[i]) * (x < this.lo[i] ? 0.35 : 0.015);
        this.hi[i] += (x - this.hi[i]) * (x > this.hi[i] ? 0.5 : 0.015);
        const span = Math.max(0.2, this.hi[i] - this.lo[i]);
        v = this.hi[i] < 0.04 ? 0 : (x - this.lo[i]) / span;
      } else {
        v = Math.max(0, (x / this.hi[0] - 0.12) / 0.88);
      }
      v = Math.min(1, Math.max(0, v));
      this.level[i] += (v - this.level[i]) * (v > this.level[i] ? attack : release);
    }
    return this.level;
  }
}
