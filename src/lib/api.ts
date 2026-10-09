import type { CollectionDetail, ContinuationPage, Lyrics, ServerConfig, UpNext } from '../../shared/types';

/** 배포 시 Cloudflare Worker 주소 (예: https://openmusic-api.xxx.workers.dev). 비어 있으면 같은 출처의 /api 사용 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

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
  continuation: (token: string) => cachedGet<ContinuationPage>(`/continuation?token=${enc(token)}`),
  album: (id: string) => cachedGet<CollectionDetail>(`/album/${enc(id)}`),
  upNext: (videoId?: string, list?: string) =>
    cachedGet<UpNext>(`/upnext?${videoId ? `v=${enc(videoId)}` : ''}${list ? `&list=${enc(list)}` : ''}`),
  lyrics: (videoId: string) => cachedGet<Lyrics | null>(`/lyrics/${enc(videoId)}`, 60 * 60_000),
};

/** 재생목록 전체 트랙을 불러온다 (이어받기 토큰을 끝까지 따라감) */
export async function loadAllTracks(detail: CollectionDetail, onPage?: (tracks: CollectionDetail['tracks']) => void) {
  const tracks = [...detail.tracks];
  let token = detail.continuation;
  let guard = 0;
  while (token && guard++ < 60) {
    const page = await api.continuation(token);
    tracks.push(...page.tracks);
    onPage?.(tracks.slice());
    token = page.continuation;
  }
  return tracks;
}
