/**
 * youtubei.js 파서 결과(YTNode)를 shared/types.ts의 단순한 모델로 변환한다.
 * InnerTube 응답은 자주 바뀌므로 영어 정규식에 의존하지 않고
 * 엔드포인트(browseId, videoId, pageType)를 기준으로 최대한 방어적으로 해석한다.
 */
import type { AlbumRef, ArtistRef, Card, Section, Track } from '../shared/types.js';
import { isMixList, stripVL } from '../shared/links.js';

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
    if (!text || SEPARATOR.test(text)) continue;
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

function trackToCard(track: Track, subtitle?: string): Card {
  return {
    kind: track.isVideo ? 'video' : 'song',
    id: track.videoId,
    title: track.title,
    subtitle:
      subtitle ??
      [track.artists.map((a) => a.name).join(', '), track.album?.name ?? track.extra].filter(Boolean).join(' • '),
    thumbnail: track.thumbnail,
    track,
  };
}

/** 리스트 아이템(곡/앨범/재생목록/아티스트) → Card */
export function cardFromListItem(item: AnyNode): Card | null {
  if (!item || item.type !== 'MusicResponsiveListItem') return null;
  const pt = pageTypeOf(item.endpoint);
  const cols: AnyNode[] = item.flex_columns ?? [];
  const title = textOf(cols[0]?.title);
  const subtitleRuns = cols.slice(1).flatMap((c: AnyNode) => runsOf(c?.title));
  const subtitle = subtitleRuns.map((r) => r.text).join('').trim();
  const thumbnail = bestThumb(item.thumbnail);
  const browseId: string | undefined = item.endpoint?.payload?.browseId;

  switch (pt) {
    case 'MUSIC_PAGE_TYPE_ALBUM':
      return browseId ? { kind: 'album', id: browseId, title, subtitle, thumbnail } : null;
    case 'MUSIC_PAGE_TYPE_PLAYLIST':
      return browseId ? { kind: 'playlist', id: stripVL(browseId), title, subtitle, thumbnail } : null;
    case 'MUSIC_PAGE_TYPE_ARTIST':
    case 'MUSIC_PAGE_TYPE_USER_CHANNEL':
      return browseId ? { kind: 'artist', id: browseId, title, subtitle, thumbnail } : null;
    default: {
      const track = trackFromListItem(item);
      return track ? trackToCard(track, subtitle || undefined) : null;
    }
  }
}

/** MusicTwoRowItem(캐러셀 카드) → Card */
export function cardFromTwoRow(item: AnyNode): Card | null {
  if (!item || item.type !== 'MusicTwoRowItem') return null;
  const ep = item.endpoint;
  const pt = pageTypeOf(ep);
  const title = textOf(item.title);
  const subtitleRuns = runsOf(item.subtitle);
  const subtitle = textOf(item.subtitle);
  const thumbnail = bestThumb(item.thumbnail);
  const browseId: string | undefined = ep?.payload?.browseId;

  if (pt === 'MUSIC_PAGE_TYPE_ALBUM' && browseId) return { kind: 'album', id: browseId, title, subtitle, thumbnail };
  if (pt === 'MUSIC_PAGE_TYPE_PLAYLIST' && browseId)
    return { kind: 'playlist', id: stripVL(browseId), title, subtitle, thumbnail };
  if ((pt === 'MUSIC_PAGE_TYPE_ARTIST' || pt === 'MUSIC_PAGE_TYPE_USER_CHANNEL') && browseId)
    return { kind: 'artist', id: browseId, title, subtitle, thumbnail };

  const videoId: string | undefined = ep?.payload?.videoId;
  const playlistId: string | undefined = ep?.payload?.playlistId;
  if (videoId) {
    const info = parseRuns(subtitleRuns);
    const plain = info.plain.filter((p) => !TYPE_LABELS.has(p));
    const vt = videoTypeOf(ep);
    const track: Track = {
      videoId,
      title,
      artists: info.artists.length ? info.artists : plain[0] ? [{ name: plain[0] }] : [],
      album: info.album,
      thumbnail,
      explicit: isExplicit(item.badges),
      isVideo: vt ? vt !== 'MUSIC_VIDEO_TYPE_ATV' : undefined,
      extra: plain.slice(info.artists.length ? 0 : 1).join(' • ') || undefined,
    };
    return { kind: track.isVideo ? 'video' : 'song', id: videoId, title, subtitle, thumbnail, track, playlistId };
  }
  if (playlistId) {
    const id = stripVL(playlistId);
    return { kind: isMixList(id) ? 'radio' : 'playlist', id, title, subtitle, thumbnail, playlistId: id };
  }
  return null;
}

/** MusicMultiRowListItem(팟캐스트 에피소드 등) → Card */
function cardFromMultiRow(item: AnyNode): Card | null {
  const videoId = item?.on_tap?.payload?.videoId;
  if (!videoId) return null;
  const title = textOf(item.title);
  const track: Track = {
    videoId,
    title,
    artists: parseRuns(runsOf(item.subtitle)).artists,
    thumbnail: bestThumb(item.thumbnail),
    isVideo: true,
  };
  return { kind: 'video', id: videoId, title, subtitle: textOf(item.subtitle), thumbnail: track.thumbnail, track };
}

export function cardFromAny(node: AnyNode): Card | null {
  switch (node?.type) {
    case 'MusicTwoRowItem':
      return cardFromTwoRow(node);
    case 'MusicResponsiveListItem':
      return cardFromListItem(node);
    case 'MusicMultiRowListItem':
      return cardFromMultiRow(node);
    default:
      return null;
  }
}

/** MusicCarouselShelf / MusicShelf / MusicPlaylistShelf → Section */
export function sectionFromShelf(shelf: AnyNode): Section | null {
  if (!shelf) return null;
  const contents: AnyNode[] = Array.isArray(shelf.contents) ? shelf.contents : [];
  const items = contents.map(cardFromAny).filter((c): c is Card => !!c);
  if (!items.length) return null;

  let title = '';
  let strapline: string | undefined;
  if (shelf.type === 'MusicCarouselShelf') {
    title = textOf(shelf.header?.title);
    strapline = textOf(shelf.header?.strapline) || undefined;
  } else {
    title = textOf(shelf.title) || textOf(shelf.header?.title);
  }

  const listLike = contents.length > 0 && contents.every((c) => c?.type === 'MusicResponsiveListItem');
  const allTracks = items.every((i) => i.track);
  const layout: Section['layout'] =
    shelf.type === 'MusicShelf' || shelf.type === 'MusicPlaylistShelf' || (listLike && allTracks) ? 'list' : 'carousel';

  // "모두 재생" 같은 버튼에서 재생목록 ID를 뽑아본다.
  const playlistId: string | undefined =
    shelf.endpoint?.payload?.browseId?.startsWith?.('VL') ? stripVL(shelf.endpoint.payload.browseId) : undefined;

  return { title, strapline, layout, items, playlistId };
}

export function sectionsFrom(nodes: AnyNode): Section[] {
  const arr: AnyNode[] = Array.isArray(nodes) ? nodes : [];
  return arr.map(sectionFromShelf).filter((s): s is Section => !!s);
}
