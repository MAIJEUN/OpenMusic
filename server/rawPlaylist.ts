/**
 * 재생목록을 youtubei.js 파서 없이 원본 JSON에서 바로 읽는다.
 * 파서는 응답 전체를 클래스 객체로 만드느라 100곡 한 페이지에 40~60ms CPU를 쓰는데,
 * Cloudflare Workers 무료 요금제는 요청당 CPU 시간이 짧아서 큰 재생목록을 이어받다가 끊길 수 있다.
 * 필요한 값만 꺼내 CPU를 줄이고, 해석이 안 되면 null을 돌려 기존 파서 경로로 넘긴다.
 */
import type { Innertube } from 'youtubei.js';
import type { CollectionDetail, ContinuationPage, Track } from '../shared/types.js';
import { stripVL } from '../shared/links.js';
import { findAll, findKey } from './json.js';
import { bestThumb, parseRawRuns, textOf, trackFromRawListItem } from './normalize.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

function tracksOf(items: AnyNode[]): Track[] {
  const out: Track[] = [];
  for (const it of items) {
    const r = it?.musicResponsiveListItemRenderer;
    const t = r ? trackFromRawListItem(r) : null;
    if (t) out.push(t);
  }
  return out;
}

function tokenOf(root: AnyNode): string | undefined {
  const cmd = findKey(root, 'continuationCommand');
  if (typeof cmd?.token === 'string') return cmd.token;
  const next = findKey(root, 'nextContinuationData');
  return typeof next?.continuation === 'string' ? next.continuation : undefined;
}

export async function rawPlaylist(yt: Innertube, id: string): Promise<CollectionDetail | null> {
  const browseId = id.startsWith('VL') ? id : `VL${id}`;
  const res = await yt.actions.execute('/browse', { browseId, client: 'YTMUSIC' });
  const data: AnyNode = res.data;
  const h = findKey(data, 'musicResponsiveHeaderRenderer');
  const shelf = findKey(data, 'musicPlaylistShelfRenderer');
  if (!h || !shelf) return null;
  const items: AnyNode[] = Array.isArray(shelf.contents) ? shelf.contents : [];
  const tracks = tracksOf(items);
  if (!tracks.length && items.length) return null;

  const sub = parseRawRuns(h.subtitle);
  const strap = parseRawRuns(h.straplineTextOne);
  const strapText = textOf(h.straplineTextOne);
  const desc = findKey(h.description, 'description') ?? h.description;
  return {
    kind: 'playlist',
    id: stripVL(id),
    title: textOf(h.title),
    subtitle: textOf(h.subtitle) || undefined,
    secondSubtitle: textOf(h.secondSubtitle) || undefined,
    author:
      strap.artists[0] ??
      sub.artists[0] ??
      (strapText ? { name: strapText } : undefined) ??
      // 새 화면 구조: 만든 사람이 facepile(아바타 묶음) 안에 들어 있다
      (typeof findKey(h, 'avatarStackViewModel')?.text?.content === 'string'
        ? { name: findKey(h, 'avatarStackViewModel').text.content }
        : undefined),
    description: textOf(desc) || undefined,
    thumbnail: bestThumb(h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    year: sub.year,
    tracks,
    continuation: tokenOf(shelf.contents?.at?.(-1)) ?? tokenOf(shelf.continuations),
  };
}

export async function rawContinuation(yt: Innertube, token: string): Promise<ContinuationPage | null> {
  const res = await yt.actions.execute('/browse', { client: 'YTMUSIC', continuation: token });
  const data: AnyNode = res.data;
  const items = findAll(data, 'musicResponsiveListItemRenderer').map((r) => ({ musicResponsiveListItemRenderer: r }));
  const tracks = tracksOf(items);
  if (!tracks.length) return null;
  return { tracks, continuation: tokenOf(data) };
}
