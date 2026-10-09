/**
 * youtubei.js(InnerTube) 기반 YouTube Music 데이터 제공자.
 * 재생 자체는 브라우저의 YouTube IFrame Player가 담당하고, 서버는 메타데이터만 가져온다.
 */
import { randomUUID } from 'node:crypto';
import { Innertube, YTNodes } from 'youtubei.js';
import type {
  ArtistDetail,
  ArtistRef,
  Card,
  CollectionDetail,
  ContinuationPage,
  FeedPage,
  Lyrics,
  SearchFilter,
  SearchResult,
  Section,
  Track,
  UpNext,
} from '../shared/types.js';
import { stripVL } from '../shared/links.js';
import {
  bestThumb,
  cardFromAny,
  pageTypeOf,
  parseRuns,
  runsOf,
  sectionFromShelf,
  sectionsFrom,
  textOf,
  trackFromListItem,
  trackFromPanelVideo,
  type TrackFallback,
} from './normalize.js';
import type { Provider, Suggestions } from './provider.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

const LANG = process.env.YT_LANG ?? 'ko';
const LOCATION = process.env.YT_LOCATION ?? 'KR';

let innertube: Promise<Innertube> | null = null;

function yt(): Promise<Innertube> {
  if (!innertube) {
    innertube = Innertube.create({
      lang: LANG,
      location: LOCATION,
      retrieve_player: false,
    }).catch((err) => {
      innertube = null;
      throw err;
    });
  }
  return innertube;
}

/** 이어서 불러오기용 객체 보관소 (토큰 → 객체), 30분 후 만료 */
const continuations = new Map<string, { value: AnyNode; fallback: TrackFallback; expires: number }>();

function saveContinuation(value: AnyNode, fallback: TrackFallback): string {
  const now = Date.now();
  for (const [k, v] of continuations) if (v.expires < now) continuations.delete(k);
  const token = randomUUID();
  continuations.set(token, { value, fallback, expires: now + 30 * 60_000 });
  return token;
}

interface HeaderInfo {
  title: string;
  subtitle?: string;
  secondSubtitle?: string;
  description?: string;
  thumbnail?: string;
  author?: ArtistRef;
  year?: string;
}

function parseHeader(header: AnyNode): HeaderInfo {
  let h = header;
  if (h?.type === 'MusicEditablePlaylistDetailHeader') h = h.header;
  if (!h) return { title: '' };

  const subtitleRuns = runsOf(h.subtitle);
  const info = parseRuns(subtitleRuns);
  const base: HeaderInfo = {
    title: textOf(h.title),
    subtitle: textOf(h.subtitle) || undefined,
    secondSubtitle: textOf(h.second_subtitle) || undefined,
    year: info.year ?? h.year,
  };

  if (h.type === 'MusicResponsiveHeader') {
    const strap = parseRuns(runsOf(h.strapline_text_one));
    const strapText = textOf(h.strapline_text_one);
    return {
      ...base,
      description: textOf(h.description?.description) || undefined,
      thumbnail: bestThumb(h.thumbnail),
      author: strap.artists[0] ?? info.artists[0] ?? (strapText ? { name: strapText } : undefined),
    };
  }
  // MusicDetailHeader (구형)
  return {
    ...base,
    description: textOf(h.description) || undefined,
    thumbnail: bestThumb(h.thumbnails),
    author: h.author ? { name: h.author.name, id: h.author.channel_id } : info.artists[0],
  };
}

function tracksFrom(items: AnyNode, fallback: TrackFallback = {}): Track[] {
  const arr: AnyNode[] = Array.isArray(items) ? items : [];
  return arr.map((i) => trackFromListItem(i, fallback)).filter((t): t is Track => !!t);
}

async function getPlaylist(id: string): Promise<CollectionDetail> {
  const music = (await yt()).music;
  const playlist = await music.getPlaylist(id);
  const h = parseHeader(playlist.header);
  const thumbnail = h.thumbnail ?? bestThumb(playlist.background);
  const tracks = tracksFrom(playlist.items);

  return {
    kind: 'playlist',
    id: stripVL(id),
    title: h.title,
    subtitle: h.subtitle,
    secondSubtitle: h.secondSubtitle,
    author: h.author,
    description: h.description,
    thumbnail,
    year: h.year,
    tracks,
    continuation: playlist.has_continuation ? saveContinuation(playlist, {}) : undefined,
  };
}

async function getContinuation(token: string): Promise<ContinuationPage> {
  const entry = continuations.get(token);
  if (!entry) throw Object.assign(new Error('만료된 continuation 토큰입니다.'), { status: 410 });
  continuations.delete(token);
  const next = await entry.value.getContinuation();
  return {
    tracks: tracksFrom(next.items ?? next.contents, entry.fallback),
    continuation: next.has_continuation ? saveContinuation(next, entry.fallback) : undefined,
  };
}

async function getAlbum(id: string): Promise<CollectionDetail> {
  const music = (await yt()).music;
  const album = await music.getAlbum(id);
  const h = parseHeader(album.header);
  const thumbnail = h.thumbnail ?? bestThumb(album.background);
  const fallback: TrackFallback = {
    album: { name: h.title, id },
    artists: h.author ? [h.author] : undefined,
    thumbnail,
  };
  let audioPlaylistId: string | undefined;
  try {
    audioPlaylistId = album.url ? new URL(album.url).searchParams.get('list') ?? undefined : undefined;
  } catch {
    /* noop */
  }
  return {
    kind: 'album',
    id,
    title: h.title,
    subtitle: h.subtitle,
    secondSubtitle: h.secondSubtitle,
    author: h.author,
    description: h.description,
    thumbnail,
    year: h.year,
    tracks: tracksFrom(album.contents, fallback),
    audioPlaylistId,
    related: sectionsFrom(album.sections),
  };
}

async function getArtist(id: string): Promise<ArtistDetail> {
  const music = (await yt()).music;
  const artist = await music.getArtist(id);
  const h: AnyNode = artist.header;
  const name = textOf(h?.title);
  const thumbnail = bestThumb(h?.thumbnail) ?? bestThumb(h?.foreground_thumbnail);
  const subscribers =
    textOf(h?.subscription_button?.subscriber_count_text) ||
    textOf(h?.subscription_button?.short_subscriber_count_text) ||
    textOf(h?.monthly_listener_count) ||
    undefined;

  const sections: AnyNode[] = Array.from(artist.sections ?? []);
  const songShelf = sections.find((s) => s?.type === 'MusicShelf');
  const songs = songShelf ? tracksFrom(songShelf.contents) : [];
  const songsBrowse: string | undefined = songShelf?.endpoint?.payload?.browseId;

  return {
    id,
    name,
    thumbnail,
    description: textOf(h?.description) || undefined,
    subscribers,
    songs,
    songsPlaylistId: songsBrowse?.startsWith('VL') ? stripVL(songsBrowse) : undefined,
    sections: sectionsFrom(sections.filter((s) => s !== songShelf)),
  };
}

function cardFromEndpoint(ep: AnyNode, title: string, subtitle: string, thumbnail?: string, subtitleRuns: AnyNode[] = []): Card | null {
  const pt = pageTypeOf(ep);
  const browseId: string | undefined = ep?.payload?.browseId;
  if (pt === 'MUSIC_PAGE_TYPE_ALBUM' && browseId) return { kind: 'album', id: browseId, title, subtitle, thumbnail };
  if (pt === 'MUSIC_PAGE_TYPE_PLAYLIST' && browseId) return { kind: 'playlist', id: stripVL(browseId), title, subtitle, thumbnail };
  if ((pt === 'MUSIC_PAGE_TYPE_ARTIST' || pt === 'MUSIC_PAGE_TYPE_USER_CHANNEL') && browseId)
    return { kind: 'artist', id: browseId, title, subtitle, thumbnail };
  const videoId: string | undefined = ep?.payload?.videoId;
  if (videoId) {
    const info = parseRuns(subtitleRuns);
    const vt = ep?.payload?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
    const track: Track = {
      videoId,
      title,
      artists: info.artists,
      album: info.album,
      duration: info.duration,
      thumbnail,
      isVideo: vt ? vt !== 'MUSIC_VIDEO_TYPE_ATV' : undefined,
    };
    return { kind: track.isVideo ? 'video' : 'song', id: videoId, title, subtitle, thumbnail, track };
  }
  return null;
}

async function search(query: string, filter: SearchFilter): Promise<SearchResult> {
  const music = (await yt()).music;
  const res = await music.search(query, { type: filter });
  const contents: AnyNode[] = Array.from(res.contents ?? []);
  const result: SearchResult = { query, sections: [] };

  const corrected = res.did_you_mean ?? res.showing_results_for;
  if (corrected) result.correctedQuery = textOf((corrected as AnyNode).corrected_query) || undefined;

  for (const node of contents) {
    if (node?.type === 'MusicCardShelf') {
      const thumbnail = bestThumb(node.thumbnail);
      const top = cardFromEndpoint(node.on_tap, textOf(node.title), textOf(node.subtitle), thumbnail, runsOf(node.subtitle));
      if (top) result.top = top;
      const extra = (Array.from(node.contents ?? []) as AnyNode[]).map(cardFromAny).filter((c): c is Card => !!c);
      if (extra.length) result.sections.push({ title: textOf(node.header?.title) || '인기 결과', layout: 'list', items: extra });
      continue;
    }
    if (node?.type === 'MusicShelf') {
      const s = sectionFromShelf(node);
      if (s) result.sections.push({ ...s, layout: 'list' });
    } else if (node?.type === 'ItemSection') {
      for (const inner of Array.from(node.contents ?? []) as AnyNode[]) {
        const s = sectionFromShelf(inner);
        if (s) result.sections.push({ ...s, layout: 'list' });
      }
    }
  }
  return result;
}

async function suggestions(query: string): Promise<Suggestions> {
  const music = (await yt()).music;
  const sections = await music.getSearchSuggestions(query);
  const queries: string[] = [];
  const items: Card[] = [];
  for (const section of sections) {
    for (const node of Array.from(section.contents ?? []) as AnyNode[]) {
      if (node?.type === 'SearchSuggestion') {
        const q = textOf(node.suggestion);
        if (q) queries.push(q);
      } else {
        const c = cardFromAny(node);
        if (c) items.push(c);
      }
    }
  }
  return { queries: queries.slice(0, 8), items: items.slice(0, 5) };
}

async function upNext(videoId?: string, playlistId?: string): Promise<UpNext> {
  const session = await yt();
  if (!videoId && !playlistId) throw Object.assign(new Error('videoId 또는 playlistId가 필요합니다.'), { status: 400 });

  // 라디오(자동 믹스)는 RDAMVM + videoId 목록을 요청한다.
  const list = playlistId ?? `RDAMVM${videoId}`;
  const response: AnyNode = await session.actions.execute('/next', {
    client: 'YTMUSIC',
    parse: true,
    ...(videoId ? { videoId } : {}),
    playlistId: list,
    isAudioOnly: true,
  });
  const panel: AnyNode = response.contents_memo?.getType?.(YTNodes.PlaylistPanel)?.[0];
  let tracks: Track[] = [];
  if (panel) {
    tracks = (Array.from(panel.contents ?? []) as AnyNode[])
      .map(trackFromPanelVideo)
      .filter((t): t is Track => !!t);
  }
  if (!tracks.length && videoId) {
    // 라디오가 비어있으면 youtubei.js의 기본 automix 경로를 시도
    const fallback: AnyNode = await session.music.getUpNext(videoId, true);
    tracks = (Array.from(fallback?.contents ?? []) as AnyNode[])
      .map(trackFromPanelVideo)
      .filter((t): t is Track => !!t);
    return { playlistId: fallback?.playlist_id, title: fallback?.title, tracks };
  }
  return { playlistId: panel?.playlist_id ?? list, title: panel?.title, tracks };
}

async function lyrics(videoId: string): Promise<Lyrics | null> {
  const music = (await yt()).music;
  try {
    const shelf: AnyNode = await music.getLyrics(videoId);
    if (!shelf) return null;
    const text = textOf(shelf.description);
    if (!text) return null;
    return { text, source: textOf(shelf.footer) || undefined };
  } catch {
    return null;
  }
}

async function related(videoId: string): Promise<FeedPage> {
  const music = (await yt()).music;
  try {
    const list: AnyNode = await music.getRelated(videoId);
    if (list?.type !== 'SectionList') return { sections: [] };
    return { sections: sectionsFrom(Array.from(list.contents ?? [])) };
  } catch {
    return { sections: [] };
  }
}

async function home(): Promise<FeedPage> {
  const music = (await yt()).music;
  let feed: AnyNode = await music.getHomeFeed();
  const sections: Section[] = sectionsFrom(Array.from(feed.sections ?? []));
  // 홈은 섹션이 적게 오므로 한두 번 더 이어서 불러온다.
  for (let i = 0; i < 2 && feed.has_continuation; i++) {
    try {
      feed = await feed.getContinuation();
      sections.push(...sectionsFrom(Array.from(feed.sections ?? [])));
    } catch {
      break;
    }
  }
  return { sections };
}

async function explore(): Promise<FeedPage> {
  const music = (await yt()).music;
  const page: AnyNode = await music.getExplore();
  return { sections: sectionsFrom(Array.from(page.sections ?? [])) };
}

export const youtubeProvider: Provider = {
  playlist: getPlaylist,
  continuation: getContinuation,
  album: getAlbum,
  artist: getArtist,
  search,
  suggestions,
  upNext,
  lyrics,
  related,
  home,
  explore,
};
