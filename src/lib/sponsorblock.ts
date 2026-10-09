/**
 * SponsorBlock 공개 API (https://sponsor.ajay.app) 조회.
 * 사용자들이 표시한 '뮤직비디오의 노래가 아닌 구간(music_offtopic)'과 '아웃트로(outro)' 구간을 가져온다.
 * 확장 프로그램 없이 사이트에서 바로 조회하며, 개인정보 보호를 위해 영상 ID의 해시 앞 4자리로만 묻는다.
 */

export interface SkipSegment {
  start: number;
  end: number;
  category: string;
}

const API = 'https://sponsor.ajay.app/api/skipSegments';
const CATEGORIES = ['music_offtopic', 'outro'];
const cache = new Map<string, Promise<SkipSegment[]>>();

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchSegments(videoId: string): Promise<SkipSegment[]> {
  const prefix = (await sha256Hex(videoId)).slice(0, 4);
  const url = `${API}/${prefix}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}&actionTypes=${encodeURIComponent('["skip"]')}`;
  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`SponsorBlock ${res.status}`);
  const list = (await res.json()) as { videoID: string; segments: { segment: [number, number]; category: string }[] }[];
  const entry = list.find((v) => v.videoID === videoId);
  return (entry?.segments ?? [])
    .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }))
    .filter((s) => s.end - s.start >= 1)
    .sort((a, b) => a.start - b.start);
}

/** 영상의 건너뛸 구간 (없거나 조회 실패면 빈 배열) */
export function skipSegments(videoId: string): Promise<SkipSegment[]> {
  let p = cache.get(videoId);
  if (!p) {
    p = fetchSegments(videoId).catch(() => {
      cache.delete(videoId);
      return [];
    });
    cache.set(videoId, p);
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  }
  return p;
}
