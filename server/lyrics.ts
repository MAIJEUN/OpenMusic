/**
 * 가사 가져오기 (YouTube Music과 같은 외부 가사 데이터).
 * 1) YouTube Music 시간 동기화 가사 — 모바일 앱(ANDROID_MUSIC)이 받는 timedLyrics
 * 2) LRCLIB(https://lrclib.net) 시간 동기화 가사 — 공개 가사 DB, LRC 형식
 * 3) 시간 정보 없는 가사 — YouTube Music 가사 탭, 없으면 LRCLIB 일반 가사
 */
import type { Innertube } from 'youtubei.js';
import type { LyricLine, Lyrics } from '../shared/types.js';
import { findKey } from './json.js';
import { textOf } from './normalize.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

export interface LyricsQuery {
  title?: string;
  artist?: string;
  album?: string;
  /** 재생 중인 영상 길이(초) */
  duration?: number;
}

function finishLines(lines: { start: number; text: string }[], duration?: number): LyricLine[] {
  const sorted = lines.filter((l) => Number.isFinite(l.start)).sort((a, b) => a.start - b.start);
  return sorted.map((l, i) => ({
    start: l.start,
    end: sorted[i + 1]?.start ?? Math.max(l.start + 5, duration ?? 0),
    text: l.text.trim(),
  }));
}

/* ------------------------- YouTube Music ------------------------- */

/** YouTube Music '가사' 탭의 browseId (MPLY...) */
async function lyricsBrowseId(yt: Innertube, videoId: string): Promise<string | undefined> {
  const res = await yt.actions.execute('/next', { videoId, client: 'YTMUSIC' });
  const tabs: AnyNode[] = findKey(res.data, 'tabs') ?? [];
  for (const tab of tabs) {
    const ep = tab?.tabRenderer?.endpoint?.browseEndpoint;
    const type = ep?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (type === 'MUSIC_PAGE_TYPE_TRACK_LYRICS' && ep.browseId) return String(ep.browseId);
  }
  return undefined;
}

async function ytmTimed(yt: Innertube, browseId: string): Promise<Lyrics | null> {
  const res = await yt.actions.execute('/browse', { browseId, client: 'YTMUSIC_ANDROID' });
  const data: AnyNode[] = findKey(res.data, 'timedLyricsData');
  if (!Array.isArray(data) || !data.length) return null;
  const lines = finishLines(
    data.map((d) => ({
      start: Number(d?.cueRange?.startTimeMilliseconds) / 1000,
      text: String(d?.lyricLine ?? ''),
    })),
  );
  // 끝 시간이 있으면 그대로 쓴다 (간주 구간에서 줄이 꺼지도록)
  data.forEach((d, i) => {
    const end = Number(d?.cueRange?.endTimeMilliseconds) / 1000;
    if (lines[i] && Number.isFinite(end) && end > lines[i].start) lines[i].end = end;
  });
  if (!lines.some((l) => l.text)) return null;
  const source = findKey(res.data, 'sourceMessage');
  return {
    text: lines.map((l) => l.text).join('\n'),
    source: typeof source === 'string' ? source : textOf(source) || undefined,
    synced: lines,
  };
}

async function ytmPlain(yt: Innertube, videoId: string): Promise<Lyrics | null> {
  const shelf: AnyNode = await yt.music.getLyrics(videoId);
  const text = shelf && textOf(shelf.description);
  if (!text) return null;
  return { text, source: textOf(shelf.footer) || undefined };
}

/* ----------------------------- LRCLIB ----------------------------- */

const LRCLIB = 'https://lrclib.net/api';
const UA = 'OpenMusic (https://github.com/maijeun/openmusic)';

interface LrclibItem {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** LRC 형식: [mm:ss.xx] 가사 (한 줄에 시간 여러 개 가능) */
export function parseLrc(lrc: string, duration?: number): LyricLine[] {
  const out: { start: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const times = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!times.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const t of times) out.push({ start: Number(t[1]) * 60 + Number(t[2]), text });
  }
  // 빈 줄(간주)은 앞 줄을 끝내는 표시로만 쓰고 보여주지 않는다
  const lines = finishLines(out, duration);
  return lines.filter((l) => l.text);
}

/** 제목에서 (Official MV), [Lyrics], feat. 같은 꾸밈말을 뗀다 */
export function cleanTitle(title: string, artist?: string): string {
  return titleCandidates(title, artist)[0] ?? '';
}

/** 검색해 볼 제목 후보들: "가수 - 제목"이면 제목 쪽, "제목 - 다른 표기"면 양쪽을 모두 시도 */
function titleCandidates(title: string, artist?: string): string[] {
  let t = title
    .replace(/[(\[【［（][^)\]】］）]*(official|mv|m\/v|music video|lyric|audio|visualizer|live|teaser|가사|뮤직비디오|공식)[^)\]】］）]*[)\]】］）]/gi, ' ')
    .replace(/\b(official\s*)?(music\s*video|m\/?v)\b/gi, ' ')
    .replace(/\s+(feat\.?|ft\.?)\s.*$/i, '')
    .replace(/＆/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const out: string[] = [];
  // 'Ditto', 「アイドル」처럼 따옴표 안에 든 게 보통 곡 제목
  const quoted = /['"‘’“”「『](.+?)['"‘’“”」』]/.exec(t)?.[1]?.trim();
  if (quoted) out.push(quoted);
  const dash = t.split(/\s+[-–—]\s+/);
  if (dash.length === 2) {
    const [a, b] = dash.map((x) => x.trim());
    const has = (x: string) => !!artist && artist.split(/[,&/]/).some((n) => n.trim() && x.toLowerCase().includes(n.trim().toLowerCase()));
    if (has(a)) out.push(b);
    else if (has(b)) out.push(a);
    else out.push(a, b);
  }
  out.push(t);
  return [...new Set(out.filter(Boolean))];
}

async function lrclibSearch(q: LyricsQuery): Promise<LrclibItem[]> {
  const titles = titleCandidates(q.title ?? '', q.artist).slice(0, 3);
  if (!titles.length) return [];
  const tries: string[] = [];
  for (const title of titles) {
    const p = new URLSearchParams({ track_name: title });
    if (q.artist) p.set('artist_name', q.artist.split(/[,&]/)[0].trim());
    tries.push(`${LRCLIB}/search?${p}`);
  }
  tries.push(`${LRCLIB}/search?${new URLSearchParams({ q: `${titles[0]} ${q.artist ?? ''}`.trim() })}`);
  for (const url of tries) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Lrclib-Client': UA } });
    if (!res.ok) continue;
    const list = (await res.json()) as LrclibItem[];
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

async function lrclib(q: LyricsQuery): Promise<Lyrics | null> {
  const list = (await lrclibSearch(q)).filter((x) => !x.instrumental && (x.syncedLyrics || x.plainLyrics));
  if (!list.length) return null;
  const diff = (x: LrclibItem) => (q.duration ? Math.abs(x.duration - q.duration) : 0);
  // 길이가 비슷한(±3초) 시간 동기화 가사 → 길이가 비슷한 가사 → 아무 동기화 가사
  const close = list.filter((x) => diff(x) <= 3).sort((a, b) => diff(a) - diff(b));
  const pick =
    close.find((x) => x.syncedLyrics) ??
    close[0] ??
    [...list].sort((a, b) => diff(a) - diff(b)).find((x) => x.syncedLyrics) ??
    list[0];
  const synced = pick.syncedLyrics ? parseLrc(pick.syncedLyrics, q.duration) : undefined;
  const text = pick.plainLyrics?.trim() || synced?.map((l) => l.text).join('\n') || '';
  if (!text) return null;
  return { text, source: '출처: LRCLIB', synced: synced?.length ? synced : undefined };
}

/* ------------------------------ 합치기 ------------------------------ */

export async function fetchLyrics(yt: Innertube, videoId: string, q: LyricsQuery): Promise<Lyrics | null> {
  // YouTube Music과 LRCLIB을 동시에 조회해서 기다리는 시간을 줄인다
  const ytmTask = (async () => {
    const browseId = await lyricsBrowseId(yt, videoId).catch(() => undefined);
    const timed = browseId ? await ytmTimed(yt, browseId).catch(() => null) : null;
    return { browseId, timed };
  })();
  const lrTask = lrclib(q).catch(() => null);

  const { browseId, timed } = await ytmTask;
  if (timed) return timed;
  const lr = await lrTask;
  if (lr?.synced) return lr;

  if (browseId) {
    try {
      const plain = await ytmPlain(yt, videoId);
      if (plain) return plain;
    } catch {
      /* 다음 방법으로 */
    }
  }
  return lr;
}
