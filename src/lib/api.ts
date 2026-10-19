import type { CollectionDetail, Counterpart, OriginalSong, ContinuationPage, Loudness, Lyrics, SearchFilter, SearchResult, ServerConfig, SyncDoc, Track, UpNext, AuthUser } from '../../shared/types';

/** 배포 시 Cloudflare Worker 주소 (예: https://openmusic-api.xxx.workers.dev). 비어 있으면 같은 출처의 /api 사용 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

/** API 주소 (배포 환경에 따라 같은 출처 또는 Worker 주소) */
export function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, '서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
  }
  if (!res.ok) {
    let message = `요청에 실패했습니다. (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* noop */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/** 로그인이 필요한 요청 (JSON 본문, 세션 토큰) — 캐시하지 않는다 */
async function send<T>(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  // 409(동기화 충돌)는 부르는 쪽에서 처리한다
  if (!res.ok && res.status !== 409) throw new ApiError(res.status, data?.error ?? `요청에 실패했습니다. (${res.status})`);
  return { status: res.status, data };
}

export const authApi = {
  loginWithGoogle: (credential: string) => send<{ token: string; user: AuthUser }>('POST', '/auth/google', null, { credential }).then((r) => r.data),
  testLogin: () => send<{ token: string; user: AuthUser }>('POST', '/auth/test', null, {}).then((r) => r.data),
  me: (token: string) => send<{ user: AuthUser }>('GET', '/auth/me', token).then((r) => r.data.user),
  load: (token: string) => send<SyncDoc>('GET', '/sync', token).then((r) => r.data),
  /** 저장. 다른 기기가 먼저 저장했으면 { conflict, doc } */
  save: (token: string, baseRev: number, data: unknown) =>
    send<{ rev?: number; conflict?: boolean; doc?: SyncDoc }>('PUT', '/sync', token, { baseRev, data }).then((r) => r.data),
};

/** 같은 요청을 짧은 시간 동안 재사용하는 클라이언트 캐시 */
const memo = new Map<string, { at: number; promise: Promise<unknown> }>();
function cachedGet<T>(path: string, ttlMs = 5 * 60_000): Promise<T> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = get<T>(path).catch((err) => {
    memo.delete(path);
    throw err;
  });
  memo.set(path, { at: Date.now(), promise });
  if (memo.size > 200) memo.delete(memo.keys().next().value as string);
  return promise;
}

const enc = encodeURIComponent;

export const api = {
  config: () => cachedGet<ServerConfig>('/config', Infinity),
  playlist: (id: string) => cachedGet<CollectionDetail>(`/playlist/${enc(id)}`),
  /** 캐시 없이 원본 재생목록을 새로 받는다 (받은 결과는 일반 요청 캐시에도 넣어 둔다) */
  playlistFresh: async (id: string) => {
    const detail = await get<CollectionDetail>(`/playlist/${enc(id)}?fresh=1`);
    memo.set(`/playlist/${enc(id)}`, { at: Date.now(), promise: Promise.resolve(detail) });
    return detail;
  },
  continuation: (token: string) => cachedGet<ContinuationPage>(`/continuation?token=${enc(token)}`),
  album: (id: string) => cachedGet<CollectionDetail>(`/album/${enc(id)}`),
  upNext: (videoId?: string, list?: string) =>
    cachedGet<UpNext>(`/upnext?${videoId ? `v=${enc(videoId)}` : ''}${list ? `&list=${enc(list)}` : ''}`),
  search: (q: string, filter: SearchFilter = 'song') => cachedGet<SearchResult>(`/search?q=${enc(q)}&filter=${filter}`),
  /** 곡 음량 (볼륨 균형 조정) */
  loudness: (q: { title: string; artist: string; duration?: number; isVideo?: boolean }) => {
    const p = new URLSearchParams({ title: q.title, artist: q.artist });
    if (q.duration) p.set('duration', String(Math.round(q.duration)));
    if (q.isVideo) p.set('video', '1');
    return cachedGet<Loudness | null>(`/loudness?${p}`, 24 * 60 * 60_000);
  },
  /** 다른 서비스(Spotify) 곡과 같은 YouTube Music 곡 */
  match: (q: { title: string; artist: string; duration?: number }) => {
    const p = new URLSearchParams({ title: q.title, artist: q.artist });
    if (q.duration) p.set('duration', String(Math.round(q.duration)));
    return cachedGet<Track | null>(`/match?${p}`, 24 * 60 * 60_000);
  },
  counterpart: (videoId: string) => cachedGet<Counterpart | null>(`/counterpart/${enc(videoId)}`, 24 * 60 * 60_000),
  /** 가사 (시간 동기화 가사가 있으면 synced 포함). 외부 가사 DB 검색용으로 곡 정보를 함께 보낸다 */
  lyrics: (
    videoId: string,
    q: { title?: string; artist?: string; album?: string; duration?: number; original?: OriginalSong } = {},
  ) => {
    const p = new URLSearchParams({ v: '7' });
    if (q.title) p.set('title', q.title);
    if (q.artist) p.set('artist', q.artist);
    if (q.album) p.set('album', q.album);
    if (q.duration) p.set('duration', String(Math.round(q.duration)));
    // 사용자가 고른 원곡
    if (q.original) {
      p.set('orig', q.original.videoId);
      p.set('origTitle', q.original.title);
      p.set('origArtist', q.original.artist);
      if (q.original.duration) p.set('origDur', String(Math.round(q.original.duration)));
    }
    return cachedGet<Lyrics | null>(`/lyrics/${enc(videoId)}?${p}`, 60 * 60_000);
  },
};

/** 재생목록 전체 트랙을 불러온다 (이어받기 토큰을 끝까지 따라감) */
/** 이어받기 중간에 실패하면 그때까지 받은 곡과 다시 시작할 토큰을 담아 던진다 */
export class PartialLoadError extends Error {
  constructor(
    message: string,
    public tracks: CollectionDetail['tracks'],
    public token: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 이어받기 한 페이지: 서버가 잠깐 실패하는 경우가 있어 간격을 늘려 가며 다시 시도한다 */
async function continuationWithRetry(token: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await api.continuation(token);
    } catch (err) {
      last = err;
      await sleep(700 * 2 ** attempt);
    }
  }
  throw last;
}

/** 재생목록 전체 트랙을 불러온다 (이어받기 토큰을 끝까지 따라감). from으로 중간부터 이어서 받을 수 있다 */
export async function loadAllTracks(
  detail: CollectionDetail,
  onPage?: (tracks: CollectionDetail['tracks']) => void,
  from?: { tracks: CollectionDetail['tracks']; token: string },
) {
  const tracks = [...(from?.tracks ?? detail.tracks)];
  let token = from?.token ?? detail.continuation;
  let guard = 0;
  while (token && guard++ < 200) {
    let page;
    try {
      page = await continuationWithRetry(token);
    } catch (err) {
      throw new PartialLoadError((err as Error).message, tracks.slice(), token);
    }
    tracks.push(...page.tracks);
    onPage?.(tracks.slice());
    token = page.continuation;
  }
  return tracks;
}
