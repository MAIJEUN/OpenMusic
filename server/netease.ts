/**
 * NetEase Cloud Music(网易云音乐) 단어별 시간 가사(yrc).
 * 비공식 웹 API라 언제든 막힐 수 있어서, 실패하면 조용히 null을 돌려주고 다른 가사를 쓴다.
 */
import type { LyricLine, LyricWord } from '../shared/types.js';

const BASE = 'https://music.163.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://music.163.com/',
};

interface NeteaseSong {
  id: number;
  name: string;
  duration?: number;
  dt?: number;
  artists?: { name: string }[];
  ar?: { name: string }[];
  alias?: string[];
}

export interface NeteaseQuery {
  titles: string[];
  artist?: string;
  /** 노래 길이(초) */
  duration?: number;
}

/** 작사·작곡 같은 크레딧 줄 */
const CREDIT = /^\s*(作词|作曲|编曲|制作人|词|曲|演唱|和声|混音|母带|吉他|贝斯|鼓|弦乐|录音|监制|出品|发行|OP|SP|Lyrics?|Composer|Arranger|Producer)\s*[:：]/i;

/** yrc: [줄시작ms,길이ms](단어시작ms,길이ms,0)단어(…)단어 */
export function parseYrc(yrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of yrc.split(/\r?\n/)) {
    const m = /^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());
    if (!m) continue;
    const start = Number(m[1]) / 1000;
    const end = start + Number(m[2]) / 1000;
    const words: LyricWord[] = [...m[3].matchAll(/\((\d+),(\d+),\d+\)([^(]*)/g)]
      .map((w) => ({ start: Number(w[1]) / 1000, end: (Number(w[1]) + Number(w[2])) / 1000, text: w[3] }))
      .filter((w) => w.text);
    const text = words.map((w) => w.text).join('').trim();
    if (!text || CREDIT.test(text)) continue;
    lines.push({ start, end, text, words });
  }
  return lines.sort((a, b) => a.start - b.start);
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

async function search(q: string): Promise<NeteaseSong[]> {
  const url = `${BASE}/api/search/get/web?${new URLSearchParams({ s: q, type: '1', offset: '0', limit: '15' })}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  const data = (await res.json()) as { result?: { songs?: NeteaseSong[] } };
  return data.result?.songs ?? [];
}

/** 제목·가수·길이가 맞는 곡의 단어별 가사 */
export async function neteaseWordLyrics(q: NeteaseQuery): Promise<{ lines: LyricLine[]; duration?: number } | null> {
  const titles = q.titles.filter(Boolean);
  if (!titles.length) return null;
  const keys = titles.map(norm).filter(Boolean);
  const artistKey = q.artist ? norm(q.artist.split(/[,&/]/)[0]) : '';

  const candidates: NeteaseSong[] = [];
  for (const query of [`${titles[0]} ${q.artist ?? ''}`.trim(), titles[0]]) {
    candidates.push(...(await search(query)));
    if (candidates.length) break;
  }
  const scored = candidates
    .map((s) => {
      const names = [s.name, ...(s.alias ?? [])].map(norm);
      const titleOk = names.some((n) => keys.some((k) => n === k || (n.length > 1 && k.length > 1 && (n.includes(k) || k.includes(n)))));
      const artists = (s.artists ?? s.ar ?? []).map((a) => norm(a.name));
      const artistOk = !artistKey || artists.some((a) => a && (a.includes(artistKey) || artistKey.includes(a)));
      const dur = (s.duration ?? s.dt ?? 0) / 1000;
      const diff = q.duration && dur ? Math.abs(dur - q.duration) : 0;
      return { s, dur, diff, ok: titleOk && (artistOk ? diff <= 4 : diff <= 1.5) };
    })
    .filter((x) => x.ok)
    .sort((a, b) => a.diff - b.diff);

  for (const { s, dur } of scored.slice(0, 2)) {
    const res = await fetch(`${BASE}/api/song/lyric/v1?${new URLSearchParams({ id: String(s.id), lv: '0', yv: '0', tv: '0', rv: '0', kv: '0', cp: 'false' })}`, {
      headers: HEADERS,
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { yrc?: { lyric?: string } };
    const lines = data.yrc?.lyric ? parseYrc(data.yrc.lyric) : [];
    if (lines.length >= 3) return { lines, duration: dur || undefined };
  }
  return null;
}
