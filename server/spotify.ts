/**
 * Spotify 링크 불러오기.
 * Spotify는 외부 사이트에서 전체 곡을 재생할 수 없어서(프리미엄 로그인 필요), 곡 목록(제목·가수·길이)만 읽고
 * 재생할 때 YouTube Music에서 같은 곡을 찾아 튼다. 목록은 로그인 없이 볼 수 있는 임베드 페이지에서 읽는다.
 * (임베드 페이지는 재생목록의 앞 100곡까지만 보여준다)
 */
import type { CollectionDetail, Track } from '../shared/types.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

const bestImage = (sources: AnyNode): string | undefined => {
  const list: AnyNode[] = Array.isArray(sources) ? sources : (sources?.sources ?? []);
  return [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
};

/** sp:playlist:ID / sp:album:ID / sp:track:ID */
export async function spotifyCollection(id: string): Promise<CollectionDetail> {
  let [, kind, spId] = id.split(':');
  if (kind === 'link') {
    // spotify.link 짧은 주소 → open.spotify.com/…
    const r = await fetch(`https://spotify.link/${spId}`, { redirect: 'manual', headers: { 'User-Agent': UA } });
    const m = /open\.spotify\.com\/(?:[\w-]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,})/.exec(r.headers.get('location') ?? (await r.text()));
    if (!m) throw new Error('Spotify 짧은 주소를 열지 못했습니다.');
    [, kind, spId] = m;
  }
  if (!['playlist', 'album', 'track'].includes(kind) || !spId) throw new Error('지원하지 않는 Spotify 주소입니다.');
  const res = await fetch(`https://open.spotify.com/embed/${kind}/${spId}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Spotify에서 불러오지 못했습니다 (${res.status})`);
  const html = await res.text();
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Spotify 페이지를 읽지 못했습니다.');
  const ent: AnyNode = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  if (!ent) throw new Error('Spotify에서 찾을 수 없는 주소입니다.');

  const cover = bestImage(ent.coverArt) ?? bestImage(ent.visualIdentity?.image);
  const toTrack = (t: AnyNode, artistsText?: string): Track | null => {
    const tid = String(t.uri ?? '').split(':').pop();
    if (!tid || !t.title) return null;
    const artists = Array.isArray(t.artists)
      ? t.artists.map((a: AnyNode) => ({ name: String(a.name) }))
      : String(artistsText ?? t.subtitle ?? '')
          .split(/\s*,\s*/)
          .filter(Boolean)
          .map((name) => ({ name }));
    return {
      videoId: `sp:${tid}`,
      title: String(t.title),
      artists,
      album: kind === 'album' ? { name: String(ent.name ?? ent.title) } : undefined,
      duration: t.duration ? Math.round(t.duration / 1000) : undefined,
      thumbnail: kind !== 'playlist' ? cover : undefined,
      explicit: !!t.isExplicit,
      isVideo: false,
      url: `https://open.spotify.com/track/${tid}`,
    };
  };

  const tracks =
    kind === 'track'
      ? [toTrack(ent)].filter((t): t is Track => !!t)
      : (Array.from(ent.trackList ?? []) as AnyNode[]).filter((t) => t.isPlayable !== false).map((t) => toTrack(t)).filter((t): t is Track => !!t);
  const author = kind === 'track' ? ent.artists?.[0]?.name : ent.subtitle;
  return {
    // 앨범도 앱 안에서는 재생목록 화면으로 연다 (/browse 경로는 YouTube Music 앨범용)
    kind: 'playlist',
    id,
    title: String(ent.name ?? ent.title ?? 'Spotify'),
    subtitle: ['Spotify', kind === 'album' ? '앨범' : kind === 'track' ? '곡' : '재생목록', author].filter(Boolean).join(' • '),
    secondSubtitle: kind === 'playlist' && tracks.length >= 100 ? 'Spotify 임베드는 앞 100곡까지만 불러올 수 있어요' : undefined,
    thumbnail: cover,
    author: author ? { name: String(author) } : undefined,
    tracks,
  };
}
