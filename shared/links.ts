/**
 * YouTube / YouTube Music 링크(또는 ID)를 앱 내부 대상(재생목록, 앨범, 아티스트, 곡)으로 해석한다.
 */
export type LinkTarget =
  | { type: 'playlist'; id: string }
  | { type: 'album'; id: string }
  | { type: 'artist'; id: string }
  | { type: 'watch'; videoId: string; list?: string };

const PLAYLIST_ID = /^(PL|OLAK5uy_|RDCLAK5uy_|RD|UU|LL|FL|OL|VL|LM|SE)[\w-]*$/;
const VIDEO_ID = /^[\w-]{11}$/;

export function stripVL(id: string): string {
  return id.startsWith('VL') ? id.slice(2) : id;
}

/** RD로 시작하지만 일반 브라우즈가 불가능한(=믹스/라디오) 재생목록인지 */
export function isMixList(id: string): boolean {
  return id.startsWith('RD') && !id.startsWith('RDCLAK');
}

export function parseLink(raw: string): LinkTarget | null {
  const input = raw.trim();
  if (!input) return null;

  // URL이 아닌 순수 ID
  if (!/^[a-z]+:\/\//i.test(input) && !input.includes('/') && !input.includes('?')) {
    if (input.startsWith('MPRE')) return { type: 'album', id: input };
    if (input.startsWith('UC') && input.length === 24) return { type: 'artist', id: input };
    if (PLAYLIST_ID.test(input) && input.length > 11) return { type: 'playlist', id: stripVL(input) };
    if (VIDEO_ID.test(input)) return { type: 'watch', videoId: input };
    return null;
  }

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m)\./, '');
  const list = url.searchParams.get('list') ?? undefined;
  const v = url.searchParams.get('v') ?? undefined;
  const path = url.pathname.replace(/\/+$/, '');

  if (host === 'youtu.be') {
    const id = path.slice(1);
    if (VIDEO_ID.test(id)) return { type: 'watch', videoId: id, list };
    return list ? { type: 'playlist', id: stripVL(list) } : null;
  }

  // 같은 앱 링크(예: http://localhost:5173/playlist?list=...)도 허용한다.
  if (path === '/playlist' && list) return { type: 'playlist', id: stripVL(list) };

  if (path === '/watch' || path.startsWith('/shorts/') || path.startsWith('/embed/')) {
    const id = v ?? path.split('/')[2];
    if (id && VIDEO_ID.test(id)) {
      return { type: 'watch', videoId: id, list: list ? stripVL(list) : undefined };
    }
    if (list) return { type: 'playlist', id: stripVL(list) };
  }

  const browse = path.match(/^\/browse\/([\w-]+)/);
  if (browse) {
    const id = browse[1];
    if (id.startsWith('MPRE')) return { type: 'album', id };
    if (id.startsWith('UC')) return { type: 'artist', id };
    if (id.startsWith('VL')) return { type: 'playlist', id: stripVL(id) };
  }

  const channel = path.match(/^\/channel\/(UC[\w-]{22})/);
  if (channel) return { type: 'artist', id: channel[1] };

  if (list) return { type: 'playlist', id: stripVL(list) };
  return null;
}

/** 링크 대상을 앱 내부 경로로 변환 */
export function targetToPath(t: LinkTarget): string {
  switch (t.type) {
    case 'playlist':
      return `/playlist?list=${encodeURIComponent(t.id)}`;
    case 'album':
      return `/browse/${encodeURIComponent(t.id)}`;
    case 'artist':
      return `/channel/${encodeURIComponent(t.id)}`;
    case 'watch':
      return `/watch?v=${encodeURIComponent(t.videoId)}${t.list ? `&list=${encodeURIComponent(t.list)}` : ''}`;
  }
}
