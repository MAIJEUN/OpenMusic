/**
 * 미디어 컨트롤 연결용 무음 오디오.
 *
 * 크롬(특히 크롬북 시스템 미디어 컨트롤)은 '실제로 미디어를 재생 중인 프레임'의 Media Session을 쓴다.
 * 소리는 YouTube iframe(다른 출처)에서 나기 때문에, 그대로 두면 컨트롤이 iframe 쪽에 연결되어
 * 우리가 등록한 다음 곡/이전 곡 버튼이 무시된다.
 * 최상위 페이지에서도 무음 오디오를 함께 재생하면 크롬이 최상위 페이지의 Media Session을 우선 사용한다.
 */

let audio: HTMLAudioElement | null = null;

/** 10초짜리 무음 WAV (크롬은 5초보다 짧은 미디어는 미디어 컨트롤 대상에서 제외한다) */
function silentWavUrl(): string {
  const rate = 4000;
  const seconds = 10;
  const samples = rate * seconds;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true); // byte rate
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // 8-bit
  str(36, 'data');
  v.setUint32(40, samples, true);
  new Uint8Array(buf, 44).fill(128); // 8비트 PCM의 무음 값
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(silentWavUrl());
    audio.loop = true;
    audio.preload = 'auto';
    audio.setAttribute('aria-hidden', 'true');
  }
  return audio;
}

export function anchorPlay() {
  const a = element();
  if (a.paused) a.play().catch(() => {});
}

export function anchorPause() {
  if (audio && !audio.paused) audio.pause();
}
