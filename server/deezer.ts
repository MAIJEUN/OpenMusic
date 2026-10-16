/**
 * 곡 음량 (볼륨 균형 조정용).
 * YouTube는 서버에서 곡별 음량 정보를 받을 수 없어서(로그인 요구), 같은 곡의 Deezer 정보에 있는
 * 음량값(gain — 곡 전체의 평균 음량, 대략 LUFS)을 쓴다. 공개 API라 키가 필요 없다.
 */
import type { Loudness, LoudnessQuery } from '../shared/types.js';
import { titleCandidates } from './lyrics.js';

const API = 'https://api.deezer.com';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

export async function deezerLoudness(q: LoudnessQuery): Promise<Loudness | null> {
  const titles = titleCandidates(q.title, q.artist);
  const title = titles[titles.length - 1] ?? q.title;
  const keys = new Set(titles.map(norm).filter(Boolean));
  const artistKeys = q.artist
    .split(/\s*[,&]\s*/)
    .map(norm)
    .filter(Boolean);

  const search = async (query: string, limit: number): Promise<AnyNode[]> => {
    const res = await fetch(`${API}/search?${new URLSearchParams({ q: query, limit: String(limit) })}`);
    return res.ok ? (((await res.json()) as AnyNode)?.data ?? []) : [];
  };
  const titleKey = norm(q.title);
  const rate = (list: AnyNode[], byDuration: boolean) =>
    list
      .map((t, i) => {
        const names = [t.title, t.title_short].filter(Boolean).map((x: string) => norm(x));
        const exact = names.some((n: string) => keys.has(n));
        const similar = exact || names.some((n: string) => [...keys].some((k) => n.length > 1 && k.length > 1 && (n.includes(k) || k.includes(n))));
        const artist = norm(String(t.artist?.name ?? ''));
        // 뮤직비디오는 올린 채널이 가수가 아닐 때가 많아서, 영상 제목에 가수 이름이 있으면 같은 가수로 본다
        const artistOk =
          !artistKeys.length ||
          artistKeys.some((a) => artist && (artist.includes(a) || a.includes(artist))) ||
          (artist.length >= 2 && titleKey.includes(artist));
        const diff = q.duration && t.duration ? Math.abs(q.duration - t.duration) : 0;
        // 뮤직비디오는 인트로·아웃트로 때문에 길이가 달라서 길이는 노래일 때만 본다
        const durOk = q.isVideo || !q.duration || diff <= 6;
        // byDuration: 제목이 다른 언어로 등록된 곡(예: 밤편지 → Through the Night) — 같은 가수에 길이가 거의 같으면 같은 곡
        const ok = byDuration ? artistOk && !!q.duration && diff <= 2 : similar && artistOk && durOk;
        return { t, ok, score: (exact ? 20 : 0) - Math.min(diff, 60) / 3 - i };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score);

  let scored = rate(await search(`${title} ${q.artist.split(',')[0]}`.trim(), 15), false);
  // 가수 칸이 올린 채널 이름인 뮤직비디오 등: 제목만으로 다시 찾는다 (제목에 가수 이름이 있어야 인정)
  if (!scored.length && q.artist) scored = rate(await search(title, 15), false);
  // 같은 가수·같은 길이로 찾는 건 제목이 한글·일본어 등이라 Deezer에 다른 언어 제목으로 올라가 있을 때만
  // (영어 제목인데 못 찾았다면 다른 곡일 가능성이 커서, 같은 가수의 길이만 비슷한 다른 곡을 잡지 않게)
  const nonLatinTitle = !/[a-z]/i.test(title);
  if (!scored.length && nonLatinTitle && !q.isVideo && q.duration && artistKeys.length) {
    scored = rate(await search(q.artist.split(',')[0], 50), true);
  }

  for (const { t } of scored.slice(0, 2)) {
    // 검색 결과에는 gain이 없어서 곡 정보를 따로 받는다
    const r = await fetch(`${API}/track/${t.id}`);
    if (!r.ok) continue;
    const full: AnyNode = await r.json();
    const gain = Number(full?.gain);
    if (Number.isFinite(gain) && gain !== 0) {
      return { loudness: gain, source: 'deezer', match: `${full.artist?.name ?? ''} - ${full.title ?? ''}` };
    }
  }
  return null;
}
