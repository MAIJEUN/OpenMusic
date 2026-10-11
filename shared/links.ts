/**
 * YouTube / YouTube Music / Spotify / SoundCloud 링크(또는 ID)를 앱 내부 대상(재생목록, 앨범, 곡)으로 해석한다.
 *
 * 다른 서비스 곡·목록은 재생목록 ID 앞에 서비스 표시를 붙여 기존 화면을 그대로 쓴다.
 * - Spotify: sp:playlist:ID, sp:album:ID, sp:track:ID (곡은 sp:ID — 재생할 때 YouTube Music에서 같은 곡을 찾는다)
 * - SoundCloud: sc:<soundcloud.com 뒤의 경로> (곡은 sc:숫자ID — SoundCloud 플레이어로 직접 재생)
 */

/** Spotify·SoundCloud 등 다른 서비스 목록인지 */
export const isExternalList = (id: string) => id.startsWith('sp:') || id.startsWith('sc:');
/** YouTube 영상이 아닌 곡 ID인지 */
export const isSoundCloudId = (videoId: string) => videoId.startsWith('sc:');
export const isSpotifyId = (videoId: string) => videoId.startsWith('sp:');
export const isYouTubeId = (videoId: string) => !isSoundCloudId(videoId) && !isSpotifyId(videoId);
export type LinkTarget =
  | { type: 'playlist'; id: string }
  | { type: 'album'; id: string }
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

  // spotify:playlist:ID 같은 Spotify URI
  const uri = input.match(/^spotify:(playlist|album|track):([A-Za-z0-9]{10,})$/);
  if (uri) return { type: 'playlist', id: `sp:${uri[1]}:${uri[2]}` };

  // URL이 아닌 순수 ID
  if (!/^[a-z]+:\/\//i.test(input) && !input.includes('/') && !input.includes('?')) {
    if (input.startsWith('MPRE')) return { type: 'album', id: input };
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

  // Spotify: open.spotify.com/(intl-ko/)playlist|album|track/ID
  if (host === 'open.spotify.com') {
    const m = url.pathname.match(/\/(playlist|album|track)\/([A-Za-z0-9]{10,})/);
    return m ? { type: 'playlist', id: `sp:${m[1]}:${m[2]}` } : null;
  }
  // 앱 공유용 짧은 주소: 서버가 실제 주소로 따라간다
  if (host === 'spotify.link') {
    const code = url.pathname.replace(/^\/+|\/+$/g, '');
    return /^[\w-]+$/.test(code) ? { type: 'playlist', id: `sp:link:${code}` } : null;
  }
  // SoundCloud: soundcloud.com/가수/곡, soundcloud.com/가수/sets/목록, on.soundcloud.com/짧은주소
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com' || host === 'api.soundcloud.com') {
    const p = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!p) return null;
    return { type: 'playlist', id: `sc:${host === 'soundcloud.com' ? '' : `${host}/`}${p}` };
  }
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
    if (id.startsWith('VL')) return { type: 'playlist', id: stripVL(id) };
  }

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
    case 'watch':
      return `/watch?v=${encodeURIComponent(t.videoId)}${t.list ? `&list=${encodeURIComponent(t.list)}` : ''}`;
  }
}
