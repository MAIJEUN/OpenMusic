/**
 * youtubei.js(InnerTube) 기반 YouTube Music 데이터 제공자.
 * 재생 자체는 브라우저의 YouTube IFrame Player가 담당하고, 서버는 메타데이터만 가져온다.
 */
import { Innertube, YTMusic, YTNodes } from 'youtubei.js';
import type { ArtistRef, CollectionDetail, ContinuationPage, Lyrics, SearchFilter, SearchResult, Track, UpNext } from '../shared/types.js';
import { stripVL } from '../shared/links.js';
import { fetchCaptions } from './captions.js';
import { bestThumb, parseRuns, runsOf, textOf, trackFromListItem, trackFromPanelVideo, type TrackFallback } from './normalize.js';
import type { Provider } from './provider.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

export const ytOptions = { lang: 'ko', location: 'KR' };

let innertube: Promise<Innertube> | null = null;

function yt(): Promise<Innertube> {
  if (!innertube) {
    innertube = Innertube.create({
      lang: ytOptions.lang,
      location: ytOptions.location,
      retrieve_player: false,
      // 서버리스 환경의 CPU/요청 수를 아끼기 위해 세션 정보를 로컬에서 생성한다.
      generate_session_locally: true,
    }).catch((err) => {
      innertube = null;
      throw err;
    });
  }
  return innertube;
}

/**
 * 재생목록 이어받기 토큰을 꺼낸다. 서버리스(Workers) 환경에서도 동작하도록
 * 서버에 상태를 저장하지 않고 InnerTube continuation 문자열을 그대로 클라이언트에 넘긴다.
 */
function continuationToken(pl: AnyNode): string | undefined {
  const items: AnyNode[] = Array.from(pl?.items ?? pl?.contents ?? []);
  const item = items.find((i) => i?.type === 'ContinuationItem');
  const fromItem = item?.endpoint?.payload?.token;
  if (typeof fromItem === 'string') return fromItem;
  const shelf: AnyNode = pl?.page?.contents_memo?.getType?.(YTNodes.MusicPlaylistShelf)?.[0];
  const fromShelf = shelf?.continuation ?? pl?.page?.continuation_contents?.continuation;
  return typeof fromShelf === 'string' ? fromShelf : undefined;
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
    continuation: continuationToken(playlist),
  };
}

async function getContinuation(token: string): Promise<ContinuationPage> {
  const session = await yt();
  const response = await session.actions.execute('/browse', { client: 'YTMUSIC', continuation: token });
  const next = new YTMusic.Playlist(response, session.actions);
  return { tracks: tracksFrom(next.items), continuation: continuationToken(next) };
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
  };
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

async function captions(videoId: string, lang?: string) {
  return fetchCaptions(await yt(), videoId, lang, ytOptions.lang);
}

async function search(query: string, filter: SearchFilter): Promise<SearchResult> {
  const music = (await yt()).music;
  const res: AnyNode = await music.search(query, { type: filter });
  const tracks: Track[] = [];
  const seen = new Set<string>();
  const shelves: AnyNode[] = Array.from(res.contents ?? []);
  for (const node of shelves) {
    const items: AnyNode[] =
      node?.type === 'ItemSection' ? Array.from(node.contents ?? []).flatMap((n: AnyNode) => Array.from(n?.contents ?? [])) : Array.from(node?.contents ?? []);
    for (const t of tracksFrom(items)) {
      if (seen.has(t.videoId)) continue;
      seen.add(t.videoId);
      tracks.push(filter === 'video' ? { ...t, isVideo: true } : t);
    }
  }
  return { query, filter, tracks };
}

export const youtubeProvider: Provider = {
  playlist: getPlaylist,
  continuation: getContinuation,
  album: getAlbum,
  upNext,
  lyrics,
  captions,
  search,
};
