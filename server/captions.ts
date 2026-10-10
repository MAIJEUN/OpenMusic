/**
 * YouTube 자막 → 시간이 붙은 가사 줄.
 * 1) 플레이어 응답의 자막 목록(caption_tracks)에서 언어를 고르고 timedtext를 받아온다.
 *    웹 클라이언트의 자막 주소는 PO 토큰이 없으면 빈 응답을 주는 경우가 있어 여러 클라이언트를 차례로 시도한다.
 * 2) 그래도 안 되면 '스크립트 표시' 패널(get_transcript)로 가져온다.
 */
import type { Innertube } from 'youtubei.js';
import type { CaptionLine, CaptionTrack, Captions } from '../shared/types.js';
import { matchCaption } from '../shared/captionMatch.js';
import { textOf } from './normalize.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

interface RawTrack extends CaptionTrack {
  url: string;
  /** 언어 코드 (예: ko, en-US) */
  lc: string;
}

const base = (lc: string) => lc.split('-')[0].toLowerCase();

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
    // 자동 자막 중간의 [音楽]·[음악] 같은 효과음 표기와 줄 앞뒤의 음표(♪ 가사 ♪)는 떼어낸다
    const text = l.text
      .replace(/\r/g, '')
      .replace(/\[[^\]\n]{1,15}\]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, '');
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

/**
 * 기본 자막은 직접 만든 자막을 우선한다 (자동 생성 자막은 직접 만든 자막이 없을 때만).
 * YouTube 기본 자막 → 노래 원어(자동 생성 자막의 언어)로 된 자막 → 사이트 언어 자막 → 첫 번째 자막
 */
function pickDefault(tracks: RawTrack[], captions: AnyNode, siteLang: string): RawTrack | undefined {
  const audio = captions?.audio_tracks?.[captions?.default_audio_track_index ?? 0];
  const idx = audio?.default_caption_track_index;
  const yd = typeof idx === 'number' ? tracks[idx] : undefined;
  if (yd && !yd.auto) return yd;
  const manual = tracks.filter((t) => !t.auto);
  const spoken = tracks.find((t) => t.auto)?.lc;
  return (
    (spoken && manual.find((t) => base(t.lc) === base(spoken))) ||
    manual.find((t) => base(t.lc) === siteLang) ||
    manual[0] ||
    tracks[0]
  );
}

function choose(tracks: RawTrack[], lang: string | undefined, captions: AnyNode, siteLang: string) {
  return matchCaption(tracks, lang, (t) => t.code) ?? tracks.find((t) => t.name === lang) ?? pickDefault(tracks, captions, siteLang);
}

/* '스크립트 표시' 패널은 언어를 이름(예: 일본어, 일본어 (자동 생성됨))으로만 알려 주므로 이름 → 언어 코드로 되돌린다 */
const LANG_CODES = (
  'af am ar az be bg bn bs ca cs cy da de el en eo es et eu fa fi fil fr ga gl gu he hi hr hu hy id is it ja jv ka kk km kn ko ky ' +
  'lo lt lv mk ml mn mr ms my ne nl no pa pl ps pt ro ru si sk sl sq sr sv sw ta te th tl tr uk ur uz vi yue zh zu ' +
  'de-DE en-US en-GB es-419 es-ES es-MX fr-FR fr-CA pt-BR pt-PT zh-CN zh-TW zh-HK zh-Hans zh-Hant'
).split(' ');
let nameToCode: Map<string, string> | null = null;
function codeOfName(name: string): string | undefined {
  if (!nameToCode) {
    nameToCode = new Map();
    try {
      for (const loc of ['ko', 'en']) {
        const dn = new Intl.DisplayNames([loc], { type: 'language' });
        for (const c of LANG_CODES) {
          const n = dn.of(c);
          if (n && !nameToCode.has(n.toLowerCase())) nameToCode.set(n.toLowerCase(), c);
        }
      }
    } catch {
      /* Intl.DisplayNames 미지원 환경 */
    }
  }
  const norm = (n: string) => n.toLowerCase().replace(/\s+/g, '');
  const key = name.toLowerCase();
  return nameToCode.get(key) ?? [...nameToCode].find(([n]) => norm(n) === norm(name))?.[1];
}

const AUTO_SUFFIX = /\s*\((자동 생성됨|자동 생성|auto-generated)\)\s*$/i;

export function transcriptTrack(name: string): RawTrack {
  const auto = AUTO_SUFFIX.test(name);
  const baseName = name.replace(AUTO_SUFFIX, '').trim();
  const lc = codeOfName(baseName) ?? baseName;
  return { code: `${auto ? 'a' : ''}.${lc}`, lc, name, auto, url: '' };
}

/** '스크립트 표시' 패널로 가져오기. 원하는 자막(ID 또는 이름)이 있으면 그 언어로 바꾼다 */
async function fromTranscript(
  yt: Innertube,
  videoId: string,
  want: { id?: string; name?: string },
  siteLang: string,
): Promise<{ tracks: RawTrack[]; lang: string; lines: CaptionLine[] } | null> {
  const info = await yt.getInfo(videoId);
  let tr: AnyNode = await info.getTranscript();
  const names: string[] = tr.languages;
  const tracks = names.map(transcriptTrack);
  const target =
    matchCaption(tracks, want.id, (t) => t.code) ?? tracks.find((t) => t.name === want.name) ?? pickDefault(tracks, null, siteLang);
  if (target && tr.selectedLanguage !== target.name) {
    try {
      tr = await tr.selectLanguage(target.name);
    } catch {
      /* 바꾸지 못하면 기본 자막 그대로 */
    }
  }
  const segs: AnyNode[] = Array.from(tr.transcript?.content?.body?.initial_segments ?? []);
  const lines = clean(
    segs
      .filter((s) => s?.start_ms !== undefined)
      .map((s) => ({ start: Number(s.start_ms) / 1000, end: Number(s.end_ms) / 1000, text: textOf(s.snippet) })),
  );
  if (!lines.length) return null;
  const cur = tracks.find((t) => t.name === tr.selectedLanguage) ?? target ?? tracks[0];
  return { tracks, lang: cur?.code ?? '', lines };
}

/** 목록은 직접 만든 자막을 먼저, 자동 생성 자막을 뒤에 둔다 */
function publicTracks(tracks: RawTrack[]): CaptionTrack[] {
  return [...tracks.filter((t) => !t.auto), ...tracks.filter((t) => t.auto)].map(({ code, name, auto }) => ({ code, name, auto }));
}

export async function fetchCaptions(yt: Innertube, videoId: string, lang: string | undefined, siteLang: string): Promise<Captions | null> {
  let known: RawTrack[] = [];
  let want: { id?: string; name?: string } = { id: lang };

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
        .map((t, i) => {
          const lc = String(t.language_code);
          const auto = t.kind === 'asr';
          // vss_id(.ko, a.ko, .en.이름)는 자막마다 달라서 같은 언어의 직접 만든/자동 자막을 구분할 수 있다
          const code = String(t.vss_id || `${auto ? 'a' : ''}.${lc}${i}`);
          return { code, lc, name: textOf(t.name) || lc, auto, url: String(t.base_url) };
        });
      if (!tracks.length) continue;
      known = tracks;
      const pick = choose(tracks, lang, captions, siteLang);
      if (!pick) continue;
      want = { id: pick.code, name: pick.name };
      const lines = await fetchTimedText(pick.url);
      if (lines.length) return { tracks: publicTracks(tracks), lang: pick.code, lines };
    } catch {
      // 다음 클라이언트로
    }
  }

  try {
    const res = await fromTranscript(yt, videoId, want, siteLang);
    if (!res) return null;
    if (!known.length) return { tracks: publicTracks(res.tracks), lang: res.lang, lines: res.lines };
    // 언어 목록은 플레이어 목록을 쓰고, 지금 자막은 같은 언어·종류로 맞춘다
    const cur = matchCaption(known, res.lang, (t) => t.code);
    return { tracks: publicTracks(known), lang: cur?.code ?? res.lang, lines: res.lines };
  } catch {
    return null;
  }
}
