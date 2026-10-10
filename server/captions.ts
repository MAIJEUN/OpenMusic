/**
 * YouTube 자막 → 시간이 붙은 가사 줄.
 * 1) 플레이어 응답의 자막 목록(caption_tracks)에서 언어를 고르고 timedtext를 받아온다.
 *    웹 클라이언트의 자막 주소는 PO 토큰이 없으면 빈 응답을 주는 경우가 있어 여러 클라이언트를 차례로 시도한다.
 * 2) 그래도 안 되면 '스크립트 표시' 패널(get_transcript)로 가져온다.
 */
import type { Innertube } from 'youtubei.js';
import type { CaptionLine, CaptionTrack, Captions } from '../shared/types.js';
import { textOf } from './normalize.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

interface RawTrack extends CaptionTrack {
  url: string;
}

const CLIENTS = ['ANDROID', 'IOS', 'WEB'] as const;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** 가사로 보여줄 필요 없는 줄: 빈 줄, 음표만 있는 줄, [음악] 같은 효과음 표기 */
function isNoise(text: string): boolean {
  const t = text.replace(/[\s♪♫♬♩~]/g, '');
  return !t || /^[[(（【].*[\])）】]$/.test(t);
}

function clean(lines: CaptionLine[]): CaptionLine[] {
  const out: CaptionLine[] = [];
  for (const l of lines) {
    const text = l.text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
    if (isNoise(text)) continue;
    const prev = out[out.length - 1];
    // 자동 자막은 같은 문장이 겹쳐 이어지는 경우가 있어 바로 앞 줄과 같으면 합친다
    if (prev && prev.text === text) {
      prev.end = Math.max(prev.end, l.end);
      continue;
    }
    out.push({ start: l.start, end: Math.max(l.end, l.start), text });
  }
  return out;
}

/** timedtext json3 형식 */
export function parseJson3(body: string): CaptionLine[] {
  const data = JSON.parse(body) as { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] };
  const lines: CaptionLine[] = [];
  for (const e of data.events ?? []) {
    if (!e.segs) continue;
    const text = e.segs.map((s) => s.utf8 ?? '').join('');
    const start = (e.tStartMs ?? 0) / 1000;
    lines.push({ start, end: start + (e.dDurationMs ?? 0) / 1000, text });
  }
  return clean(lines);
}

/** timedtext XML 형식 (srv1: <text start dur>, srv3: <p t d>) */
export function parseXml(body: string): CaptionLine[] {
  const lines: CaptionLine[] = [];
  // srv1은 본문이 한 번 더 이스케이프되어 있어(&amp;#39;) 두 번 푼다
  const strip = (s: string) => decodeEntities(decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
  for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = Number(/start="([\d.]+)"/.exec(m[1])?.[1] ?? NaN);
    const dur = Number(/dur="([\d.]+)"/.exec(m[1])?.[1] ?? 0);
    if (Number.isFinite(start)) lines.push({ start, end: start + dur, text: strip(m[2]) });
  }
  if (!lines.length) {
    for (const m of body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      const t = Number(/\bt="(\d+)"/.exec(m[1])?.[1] ?? NaN);
      const d = Number(/\bd="(\d+)"/.exec(m[1])?.[1] ?? 0);
      if (Number.isFinite(t)) lines.push({ start: t / 1000, end: (t + d) / 1000, text: strip(m[2]) });
    }
  }
  return clean(lines);
}

async function fetchTimedText(url: string): Promise<CaptionLine[]> {
  const u = new URL(url, 'https://www.youtube.com');
  u.searchParams.set('fmt', 'json3');
  const res = await fetch(u);
  if (!res.ok) return [];
  const body = (await res.text()).trim();
  if (!body) return [];
  return body.startsWith('{') ? parseJson3(body) : parseXml(body);
}

/** 기본 언어: YouTube 기본 자막 → 사이트 언어의 직접 만든 자막 → 첫 번째 직접 만든 자막 → 자동 생성 자막 */
function pickDefault(tracks: RawTrack[], captions: AnyNode, siteLang: string): RawTrack | undefined {
  const audio = captions?.audio_tracks?.[captions?.default_audio_track_index ?? 0];
  const idx = audio?.default_caption_track_index;
  const yd = typeof idx === 'number' ? tracks[idx] : undefined;
  if (yd && !yd.auto) return yd;
  const manual = tracks.filter((t) => !t.auto);
  return manual.find((t) => t.code.split('-')[0] === siteLang) ?? manual[0] ?? tracks[0];
}

function choose(tracks: RawTrack[], lang: string | undefined, captions: AnyNode, siteLang: string) {
  return (lang && (tracks.find((t) => t.code === lang) ?? tracks.find((t) => t.name === lang))) || pickDefault(tracks, captions, siteLang);
}

/** '스크립트 표시' 패널로 가져오기 (언어는 표시 이름으로 고른다) */
async function fromTranscript(yt: Innertube, videoId: string, wantName?: string): Promise<{ tracks: CaptionTrack[]; lang: string; lines: CaptionLine[] } | null> {
  const info = await yt.getInfo(videoId);
  let tr: AnyNode = await info.getTranscript();
  if (wantName && tr.selectedLanguage !== wantName && tr.languages.includes(wantName)) tr = await tr.selectLanguage(wantName);
  const segs: AnyNode[] = Array.from(tr.transcript?.content?.body?.initial_segments ?? []);
  const lines = clean(
    segs
      .filter((s) => s?.start_ms !== undefined)
      .map((s) => ({ start: Number(s.start_ms) / 1000, end: Number(s.end_ms) / 1000, text: textOf(s.snippet) })),
  );
  if (!lines.length) return null;
  const names: string[] = tr.languages;
  const tracks = names.map((n) => ({ code: n, name: n, auto: /자동|auto/i.test(n) }));
  return { tracks, lang: tr.selectedLanguage || names[0] || '', lines };
}

export async function fetchCaptions(yt: Innertube, videoId: string, lang: string | undefined, siteLang: string): Promise<Captions | null> {
  let known: RawTrack[] = [];
  let wantName: string | undefined;

  for (const client of CLIENTS) {
    try {
      const info: AnyNode = await yt.getBasicInfo(videoId, { client });
      const captions = info.captions;
      const raw: AnyNode[] = Array.from(captions?.caption_tracks ?? []);
      if (!raw.length) {
        // 재생 가능한 응답인데 자막이 없으면 다른 클라이언트도 마찬가지
        if (info.playability_status?.status === 'OK') return null;
        continue;
      }
      const tracks: RawTrack[] = raw
        .filter((t) => t?.base_url && t?.language_code)
        .map((t) => ({ code: String(t.language_code), name: textOf(t.name) || String(t.language_code), auto: t.kind === 'asr', url: String(t.base_url) }));
      if (!tracks.length) continue;
      known = tracks;
      const pick = choose(tracks, lang, captions, siteLang);
      if (!pick) continue;
      wantName = pick.name;
      const lines = await fetchTimedText(pick.url);
      if (lines.length) return { tracks: tracks.map(({ url: _url, ...t }) => t), lang: pick.code, lines };
    } catch {
      // 다음 클라이언트로
    }
  }

  try {
    const res = await fromTranscript(yt, videoId, wantName);
    if (!res) return null;
    if (!known.length) return res;
    // 언어 목록은 코드가 있는 플레이어 목록을 쓰고, 지금 언어는 이름으로 맞춘다
    const cur = known.find((t) => t.name === res.lang);
    return { tracks: known.map(({ url: _url, ...t }) => t), lang: cur?.code ?? res.lang, lines: res.lines };
  } catch {
    return null;
  }
}
