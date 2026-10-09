/**
 * youtubei.js 파서 결과(YTNode)를 shared/types.ts의 단순한 모델로 변환한다.
 * InnerTube 응답은 자주 바뀌므로 영어 정규식에 의존하지 않고
 * 엔드포인트(browseId, videoId, pageType)를 기준으로 최대한 방어적으로 해석한다.
 */
import type { AlbumRef, ArtistRef, Track } from '../shared/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

interface Run {
  text: string;
  endpoint?: AnyNode;
}

const DURATION = /^\d+(?::[0-5]\d)+$/;
const YEAR = /^[12]\d{3}$/;
const SEPARATOR = /^\s*(•|·|&|,|및|and|x|×|\/)?\s*$/i;

/** 검색 결과 등에서 맨 앞에 붙는 유형 라벨 (ko/en) */
const TYPE_LABELS = new Set([
  '노래', 'Song', '동영상', 'Video', '앨범', 'Album', '싱글', 'Single', 'EP',
  '재생목록', 'Playlist', '아티스트', 'Artist', '에피소드', 'Episode', '팟캐스트', 'Podcast',
  '프로필', 'Profile', '커뮤니티 재생목록', 'Community playlist', '추천 재생목록', 'Featured playlist',
]);

export function textOf(t: AnyNode): string {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (typeof t.toString === 'function') {
    const s = t.toString();
    if (s && s !== '[object Object]') return s;
  }
  return t.text ?? '';
}

export function runsOf(t: AnyNode): Run[] {
  if (!t) return [];
  if (Array.isArray(t.runs) && t.runs.length) return t.runs as Run[];
  const s = textOf(t);
  return s ? [{ text: s }] : [];
}

function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

export function bestThumb(thumbs: AnyNode): string | undefined {
  const list: AnyNode[] = Array.isArray(thumbs)
    ? thumbs
    : Array.isArray(thumbs?.contents)
      ? thumbs.contents
      : Array.isArray(thumbs?.thumbnails)
        ? thumbs.thumbnails
        : [];
  if (!list.length) return undefined;
  const best = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return normalizeUrl(best?.url);
}

export function pageTypeOf(ep: AnyNode): string | undefined {
  return ep?.payload?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
}

export function videoTypeOf(ep: AnyNode): string | undefined {
  return ep?.payload?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
}

function browseIdOf(run: Run): string | undefined {
  const id = run.endpoint?.payload?.browseId;
  return typeof id === 'string' ? id : undefined;
}

export function parseDuration(text?: string): number | undefined {
  if (!text || !DURATION.test(text.trim())) return undefined;
  return text
    .trim()
    .split(':')
    .reduce((acc, part) => acc * 60 + Number(part), 0);
}

interface RunInfo {
  artists: ArtistRef[];
  album?: AlbumRef;
  year?: string;
  duration?: number;
  /** 링크가 없는 나머지 텍스트 조각 */
  plain: string[];
}

/** "노래 • 아티스트 & 아티스트 • 앨범 • 3:45" 같은 런 배열을 해석 */
export function parseRuns(runs: Run[]): RunInfo {
  const info: RunInfo = { artists: [], plain: [] };
  for (const run of runs) {
    const text = run.text?.trim() ?? '';
    if (!text || SEPARATOR.test(text) || text === 'N/A') continue;
    const browseId = browseIdOf(run);
    if (browseId?.startsWith('UC') || pageTypeOf(run.endpoint) === 'MUSIC_PAGE_TYPE_ARTIST') {
      info.artists.push({ name: text, id: browseId });
    } else if (browseId?.startsWith('MPRE')) {
      info.album = { name: text, id: browseId };
    } else if (DURATION.test(text)) {
      info.duration = parseDuration(text);
    } else if (YEAR.test(text)) {
      info.year = text;
    } else {
      // "A, B & C"처럼 하나의 런에 여러 텍스트가 섞인 경우는 그대로 둔다.
      info.plain.push(text);
    }
  }
  return info;
}

function isExplicit(badges: AnyNode): boolean {
  if (!badges) return false;
  const arr: AnyNode[] = Array.isArray(badges) ? badges : [badges];
  return arr.some((b) => b?.icon_type === 'MUSIC_EXPLICIT_BADGE');
}

function videoIdFromNode(item: AnyNode): string | undefined {
  const col0 = item.flex_columns?.[0]?.title;
  return (
    (['song', 'video', 'non_music_track'].includes(item.item_type) ? item.id : undefined) ??
    runsOf(col0)[0]?.endpoint?.payload?.videoId ??
    item.overlay?.content?.endpoint?.payload?.videoId ??
    item.endpoint?.payload?.videoId
  );
}

export interface TrackFallback {
  album?: AlbumRef;
  artists?: ArtistRef[];
  thumbnail?: string;
}

/** MusicResponsiveListItem → Track (재생 불가 항목이면 null) */
export function trackFromListItem(item: AnyNode, fallback: TrackFallback = {}): Track | null {
  if (!item || item.type !== 'MusicResponsiveListItem') return null;
  const pt = pageTypeOf(item.endpoint);
  if (pt && pt !== 'MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE') return null; // 앨범/아티스트/재생목록 항목

  const videoId = videoIdFromNode(item);
  if (!videoId || typeof videoId !== 'string') return null;

  const cols: AnyNode[] = item.flex_columns ?? [];
  const title = textOf(cols[0]?.title) || item.title || '';
  const col1 = runsOf(cols[1]?.title);
  const rest = cols.slice(2).flatMap((c: AnyNode) => runsOf(c?.title));
  const info1 = parseRuns(col1);
  const infoRest = parseRuns(rest);

  let artists = info1.artists.length ? info1.artists : infoRest.artists;
  const plain1 = info1.plain.filter((p) => !TYPE_LABELS.has(p));
  if (!artists.length && fallback.artists?.length) artists = fallback.artists;
  if (!artists.length && plain1.length) artists = [{ name: plain1[0] }];

  const fixedText = (item.fixed_columns ?? []).map((c: AnyNode) => textOf(c?.title)).find((t: string) => DURATION.test(t));
  const duration =
    item.duration?.seconds || parseDuration(fixedText) || info1.duration || infoRest.duration || undefined;

  const vt = videoTypeOf(runsOf(cols[0]?.title)[0]?.endpoint) ?? videoTypeOf(item.overlay?.content?.endpoint);
  const usedNames = new Set(artists.map((a) => a.name));
  const extraText = [...plain1, ...infoRest.plain.filter((p) => !TYPE_LABELS.has(p))]
    .filter((p) => !usedNames.has(p))
    .join(' • ');

  return {
    videoId,
    title,
    artists,
    album: info1.album ?? infoRest.album ?? fallback.album,
    duration,
    thumbnail: bestThumb(item.thumbnail) ?? fallback.thumbnail,
    explicit: isExplicit(item.badges),
    isVideo: vt ? vt !== 'MUSIC_VIDEO_TYPE_ATV' : undefined,
    extra: extraText || undefined,
  };
}

/** PlaylistPanelVideo(다음 트랙 패널 항목) → Track */
export function trackFromPanelVideo(node: AnyNode): Track | null {
  if (!node) return null;
  if (node.type === 'PlaylistPanelVideoWrapper') node = node.primary;
  if (!node || node.type !== 'PlaylistPanelVideo' || !node.video_id) return null;
  const info = parseRuns(runsOf(node.long_byline_text ?? node.short_byline_text));
  const artists: ArtistRef[] = node.artists?.length
    ? node.artists.map((a: AnyNode) => ({ name: a.name, id: a.channel_id }))
    : info.artists.length
      ? info.artists
      : node.author
        ? [{ name: node.author }]
        : [];
  return {
    videoId: node.video_id,
    title: textOf(node.title),
    artists,
    album: node.album ? { name: node.album.name, id: node.album.id } : info.album,
    duration: node.duration?.seconds || undefined,
    thumbnail: bestThumb(node.thumbnail),
    explicit: isExplicit(node.badges),
    isVideo: (() => {
      const vt = videoTypeOf(node.endpoint);
      return vt ? vt !== 'MUSIC_VIDEO_TYPE_ATV' : undefined;
    })(),
  };
}
