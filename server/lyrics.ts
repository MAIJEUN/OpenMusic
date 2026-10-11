/**
 * 가사 가져오기 (YouTube Music과 같은 외부 가사 데이터).
 * 0) 단어별 시간이 있는 가사 — NetEase Cloud Music(yrc, 비공식 API) 또는 LRCLIB Enhanced LRC (노래방 효과용)
 * 1) YouTube Music 시간 동기화 가사 — 모바일 앱(ANDROID_MUSIC)이 받는 timedLyrics
 * 2) LRCLIB(https://lrclib.net) 시간 동기화 가사 — 공개 가사 DB, LRC 형식
 * 3) 시간 정보 없는 가사 — YouTube Music 가사 탭, 없으면 LRCLIB 일반 가사
 */
import type { Innertube } from 'youtubei.js';
import type { LyricLine, LyricWord, Lyrics } from '../shared/types.js';
import { findKey } from './json.js';
import { neteaseWordLyrics } from './netease.js';
import { textOf, trackFromListItem } from './normalize.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

export interface LyricsQuery {
  title?: string;
  artist?: string;
  album?: string;
  /** 재생 중인 영상 길이(초) */
  duration?: number;
}

function finishLines(lines: { start: number; text: string; words?: LyricWord[] }[], duration?: number): LyricLine[] {
  const sorted = lines.filter((l) => Number.isFinite(l.start)).sort((a, b) => a.start - b.start);
  return sorted.map((l, i) => {
    const end = sorted[i + 1]?.start ?? Math.max(l.start + 5, duration ?? 0);
    const words = l.words?.length ? l.words.map((w, j, ws) => ({ ...w, end: Math.min(w.end, ws[j + 1]?.start ?? end, end) })) : undefined;
    // 단어 시간이 있으면 마지막 단어가 끝날 때 줄도 끝난다 (간주 표시가 정확해진다)
    const lineEnd = words ? Math.max(words[words.length - 1].end, l.start + 0.5) : end;
    return { start: l.start, end: lineEnd, text: l.text.trim(), ...(words ? { words } : {}) };
  });
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
/** Enhanced LRC의 단어 시간: "<00:12.34> 단어 <00:12.80> 단어" */
function parseLrcWords(body: string, lineStart: number): { text: string; words?: LyricWord[] } {
  const parts = [...body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g)];
  if (!parts.length) return { text: body.trim() };
  const words: LyricWord[] = [];
  const lead = body.slice(0, parts[0].index).replace(/<[^>]*>/g, '');
  if (lead.trim()) words.push({ start: lineStart, end: lineStart, text: lead });
  for (const p of parts) {
    const start = Number(p[1]) * 60 + Number(p[2]);
    if (p[3]) words.push({ start, end: Infinity, text: p[3] });
  }
  // 단어 끝 = 다음 단어 시작 (마지막 단어는 줄 끝에서 정해진다)
  for (let i = 0; i < words.length - 1; i++) words[i].end = words[i + 1].start;
  const text = words
    .map((w) => w.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, words: words.length > 1 && text ? words : undefined };
}

export function parseLrc(lrc: string, duration?: number): LyricLine[] {
  const out: { start: number; text: string; words?: LyricWord[] }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const times = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!times.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '');
    for (const t of times) {
      const start = Number(t[1]) * 60 + Number(t[2]);
      out.push({ start, ...parseLrcWords(body, start) });
    }
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
export function titleCandidates(title: string, artist?: string): string[] {
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
  const hasWords = (x: LrclibItem) => !!x.syncedLyrics && /<\d+:\d+(\.\d+)?>/.test(x.syncedLyrics);
  const pick =
    close.find(hasWords) ??
    close.find((x) => x.syncedLyrics) ??
    close[0] ??
    [...list].sort((a, b) => diff(a) - diff(b)).find((x) => x.syncedLyrics) ??
    list[0];
  const synced = pick.syncedLyrics ? parseLrc(pick.syncedLyrics, q.duration) : undefined;
  const text = pick.plainLyrics?.trim() || synced?.map((l) => l.text).join('\n') || '';
  if (!text) return null;
  return { text, source: '출처: LRCLIB', synced: synced?.length ? synced : undefined, duration: pick.duration || undefined };
}

/* ------------------------------ 합치기 ------------------------------ */

/* ------------------------------ 커버곡 ------------------------------ */

const COVER_WORDS = /(cover(ed)?|커버|불러\s*(봄|봤|보았|봤어요|드림)|歌ってみた|歌いました|カバー|翻唱|弾き語り|acoustic|어쿠스틱|piano\s*ver|피아노\s*ver|band\s*ver|밴드\s*ver)/i;

/** 제목에서 커버 표시(괄호 안의 cover by…, | Cover, 【歌ってみた】 등)를 지운다 */
export function stripCover(title: string): string {
  let t = title
    // 괄호 안에 커버 관련 말이 있으면 괄호째로
    .replace(/[(\[【［（<〈《][^)\]】］）>〉》]*[)\]】］）>〉》]/g, (m) => (COVER_WORDS.test(m) ? ' ' : m))
    // "| Cover by …", "/ 歌ってみた" 처럼 구분자 뒤에 오는 커버 표시
    .split(/\s*[|｜/／]\s*/)
    .filter((part, i) => i === 0 || !COVER_WORDS.test(part))
    .join(' - ')
    // 남은 "cover by 누구" 꼬리와 제목 중간의 커버 표시(歌ってみた, 커버 등)
    .replace(/\s*[-–—~]?\s*cover(ed)?\s*(by|ver\.?|version)\s.*$/i, '')
    .replace(/(cover(ed)?|커버|歌ってみた|歌いました|カバー|翻唱)(?=\s|$|[-–—~])/gi, ' ')
    .replace(/\s*[-–—~]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) t = title;
  return t;
}

const normKey = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

/** 커버곡 제목으로 원곡(YouTube Music의 노래)을 찾는다 */
async function originalSong(yt: Innertube, title: string, coverArtist?: string) {
  const cands = titleCandidates(stripCover(title), coverArtist);
  const keys = cands.map(normKey).filter((k) => k.length > 1);
  if (!keys.length) return null;
  const coverKey = coverArtist ? normKey(coverArtist) : '';
  for (const query of [...new Set([cands[cands.length - 1], cands[0]])]) {
    const res: AnyNode = await yt.music.search(query, { type: 'song' });
    const items: AnyNode[] = Array.from(res.contents ?? []).flatMap((s: AnyNode) => Array.from(s?.contents ?? []));
    for (const it of items) {
      const t = trackFromListItem(it);
      if (!t) continue;
      const k = normKey(t.title);
      const titleOk = keys.some((key) => k === key || k.includes(key) || key.includes(k));
      const artist = t.artists.map((a) => a.name).join(', ');
      // 커버한 사람 본인의 노래는 원곡이 아니다
      if (!titleOk || (coverKey && normKey(artist).includes(coverKey))) continue;
      return { videoId: t.videoId, title: t.title, artist, duration: t.duration };
    }
  }
  return null;
}

/** 이 영상 자체의 가사 (YouTube Music · LRCLIB · NetEase) */
async function fetchDirect(yt: Innertube, videoId: string, q: LyricsQuery): Promise<Lyrics | null> {
  // YouTube Music, LRCLIB, NetEase를 동시에 조회해서 기다리는 시간을 줄인다
  const ytmTask = (async () => {
    const browseId = await lyricsBrowseId(yt, videoId).catch(() => undefined);
    const timed = browseId ? await ytmTimed(yt, browseId).catch(() => null) : null;
    return { browseId, timed };
  })();
  const lrTask = lrclib(q).catch(() => null);
  const neTask = neteaseWordLyrics({ titles: titleCandidates(q.title ?? '', q.artist), artist: q.artist, duration: q.duration })
    .then((r) => (r ? ({ text: r.lines.map((l) => l.text).join('\n'), source: '출처: NetEase Cloud Music', synced: r.lines, duration: r.duration } as Lyrics) : null))
    .catch(() => null);

  // 단어별 시간이 있는 가사가 있으면 그걸 먼저 (노래방 효과)
  const [ne, lr] = await Promise.all([neTask, lrTask]);
  if (lr?.synced?.some((l) => l.words)) return lr;
  if (ne) return ne;

  const { browseId, timed } = await ytmTask;
  if (timed) return timed;
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

export async function fetchLyrics(yt: Innertube, videoId: string, q: LyricsQuery): Promise<Lyrics | null> {
  // 제목에 커버 표시가 있으면 원곡 찾기를 처음부터 같이 돌려 기다리는 시간을 줄인다
  const looksCover = !!q.title && COVER_WORDS.test(q.title);
  const origLyrics = async () => {
    const orig = await originalSong(yt, q.title ?? '', q.artist).catch(() => null);
    if (!orig) return null;
    const ly = await fetchDirect(yt, orig.videoId, { title: orig.title, artist: orig.artist, duration: orig.duration });
    return ly ? { orig, ly } : null;
  };
  const early = looksCover ? origLyrics() : null;

  const direct = await fetchDirect(yt, videoId, q);
  if (direct || !q.title) return direct;

  // 커버곡 등 가사를 못 찾으면 원곡을 찾아 그 가사를 보여준다
  const found = await (early ?? origLyrics());
  if (!found) return null;
  const { orig, ly } = found;
  const timingMatches = !!(q.duration && orig.duration && Math.abs(q.duration - orig.duration) <= 3);
  return {
    ...ly,
    source: [`원곡 가사: ${orig.artist} - ${orig.title}`, ly.source].filter(Boolean).join(' · '),
    original: { title: orig.title, artist: orig.artist, timingMatches },
  };
}
