/**
 * SoundCloud 검색·링크 불러오기.
 * 공식 API 키 발급이 막혀 있어서, soundcloud.com 웹 앱이 쓰는 공개 client_id를 웹 앱 스크립트에서 찾아 쓴다.
 * (바뀌면 401/403이 나므로 다시 찾는다). 재생은 브라우저에서 SoundCloud 공식 임베드 플레이어(Widget)로 한다.
 */
import type { CollectionDetail, Track } from '../shared/types.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const API = 'https://api-v2.soundcloud.com';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

let clientId: Promise<string> | null = null;

async function findClientId(): Promise<string> {
  const home = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text();
  const scripts = [...home.matchAll(/<script crossorigin src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  // client_id는 보통 마지막 쪽 스크립트에 들어 있다
  for (const src of scripts.reverse()) {
    const js = await (await fetch(src)).text();
    const m = /client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/.exec(js) ?? /[?&]client_id=([a-zA-Z0-9]{32})/.exec(js);
    if (m) return m[1];
  }
  throw new Error('SoundCloud에 연결하지 못했습니다.');
}

function getClientId(): Promise<string> {
  if (!clientId) clientId = findClientId().catch((e) => ((clientId = null), Promise.reject(e)));
  return clientId;
}

async function scFetch(path: string, params: Record<string, string> = {}): Promise<AnyNode> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = await getClientId();
    const res = await fetch(`${API}${path}?${new URLSearchParams({ ...params, client_id: id })}`, { headers: { 'User-Agent': UA } });
    if (res.status === 401 || res.status === 403) {
      clientId = null; // 바뀐 client_id 다시 찾기
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`SoundCloud 오류 (${res.status})`);
    return res.json();
  }
  throw new Error('SoundCloud에 연결하지 못했습니다.');
}

/** 앨범 아트 큰 크기 (-large = 100px → -t500x500) */
const art = (url?: string | null) => (url ? url.replace('-large.', '-t500x500.') : undefined);

export function scTrack(t: AnyNode): Track | null {
  if (!t?.id || !t.title) return null;
  // 임베드가 막혔거나 미리듣기만 되는 곡은 재생할 수 없다
  if (t.embeddable_by === 'none' || t.policy === 'BLOCK' || t.policy === 'SNIP') return null;
  return {
    videoId: `sc:${t.id}`,
    title: String(t.title),
    artists: [{ name: String(t.publisher_metadata?.artist || t.user?.username || 'SoundCloud') }],
    duration: t.full_duration || t.duration ? Math.round((t.full_duration || t.duration) / 1000) : undefined,
    thumbnail: art(t.artwork_url) ?? art(t.user?.avatar_url),
    isVideo: false,
    extra: 'SoundCloud',
    url: t.permalink_url,
  };
}

export async function scSearch(query: string): Promise<Track[]> {
  const data = await scFetch('/search/tracks', { q: query, limit: '30' });
  return (data?.collection ?? []).map(scTrack).filter((t: Track | null): t is Track => !!t);
}

/** 재생목록의 뒷부분 곡은 id만 오므로 50개씩 다시 받아 채운다 */
async function fillTracks(list: AnyNode[]): Promise<AnyNode[]> {
  const missing = list.filter((t) => !t.title).map((t) => t.id);
  const byId = new Map<number, AnyNode>();
  for (let i = 0; i < missing.length; i += 50) {
    const part = await scFetch('/tracks', { ids: missing.slice(i, i + 50).join(',') });
    for (const t of Array.isArray(part) ? part : []) byId.set(t.id, t);
  }
  return list.map((t) => (t.title ? t : byId.get(t.id) ?? t));
}

/** sc:<경로> 목록 → 화면용 재생목록 */
export async function scCollection(id: string): Promise<CollectionDetail> {
  const path = id.slice(3);
  let url = path.includes('/') && /^(on|api)\.soundcloud\.com\//.test(path) ? `https://${path}` : `https://soundcloud.com/${path}`;
  // 짧은 주소(on.soundcloud.com)는 실제 주소로 따라간다
  if (url.startsWith('https://on.soundcloud.com/')) {
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA } });
    const loc = r.headers.get('location');
    if (loc) url = loc.split('?')[0];
  }
  const data = await scFetch('/resolve', { url });
  if (!data) throw new Error('SoundCloud에서 찾을 수 없는 주소입니다.');

  if (data.kind === 'track') {
    const t = scTrack(data);
    return {
      kind: 'playlist',
      id,
      title: String(data.title),
      subtitle: ['SoundCloud', data.user?.username].filter(Boolean).join(' • '),
      thumbnail: art(data.artwork_url) ?? art(data.user?.avatar_url),
      author: data.user?.username ? { name: data.user.username } : undefined,
      description: data.description || undefined,
      tracks: t ? [t] : [],
    };
  }
  if (data.kind === 'playlist' || data.kind === 'system-playlist') {
    const tracks = (await fillTracks(Array.from(data.tracks ?? [])))
      .map(scTrack)
      .filter((t): t is Track => !!t);
    return {
      kind: 'playlist',
      id,
      title: String(data.title),
      subtitle: ['SoundCloud', data.set_type === 'album' ? '앨범' : '재생목록', data.user?.username].filter(Boolean).join(' • '),
      thumbnail: art(data.artwork_url) ?? tracks[0]?.thumbnail,
      author: data.user?.username ? { name: data.user.username } : undefined,
      description: data.description || undefined,
      tracks,
    };
  }
  if (data.kind === 'user') {
    // 가수 페이지 링크면 그 사람이 올린 곡
    const res = await scFetch(`/users/${data.id}/tracks`, { limit: '100' });
    const tracks = (res?.collection ?? []).map(scTrack).filter((t: Track | null): t is Track => !!t);
    return {
      kind: 'playlist',
      id,
      title: String(data.username),
      subtitle: 'SoundCloud • 업로드한 곡',
      thumbnail: art(data.avatar_url),
      tracks,
    };
  }
  throw new Error('지원하지 않는 SoundCloud 주소입니다.');
}
