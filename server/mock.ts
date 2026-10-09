/**
 * 개발/오프라인 테스트용 목 데이터 공급자. `MOCK=1` 또는 `--mock`으로 실행하면 사용된다.
 * 실제 YouTube에 접속하지 않고 UI 흐름 전체를 확인할 수 있다.
 */
import type { ArtistDetail, Card, CollectionDetail, Section, Track } from '../shared/types.js';
import type { Provider } from './provider.js';

const ARTISTS = [
  { id: 'UCmockArtist000000000001', name: 'NewJeans' },
  { id: 'UCmockArtist000000000002', name: 'IU' },
  { id: 'UCmockArtist000000000003', name: 'aespa' },
  { id: 'UCmockArtist000000000004', name: 'DAY6' },
  { id: 'UCmockArtist000000000005', name: 'Hoshino Gen' },
  { id: 'UCmockArtist000000000006', name: 'The Weeknd' },
  { id: 'UCmockArtist000000000007', name: 'Lauv' },
  { id: 'UCmockArtist000000000008', name: '잔나비' },
];

const WORDS = [
  'Midnight', 'Blue', 'Summer', 'Dream', 'Rain', 'City', 'Lights', 'Echo', 'Love', 'Hype',
  'Gold', 'Night', 'Drive', 'Star', 'Moon', 'Coffee', '봄날', '밤편지', '우리', '여름밤',
  'Cherry', 'Velvet', 'Sugar', 'Fade', 'Run', 'Home', 'Wave', 'Ditto', 'Sunrise', 'Ocean',
];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const img = (seed: string | number) => `/api/mock/img/${encodeURIComponent(String(seed))}.svg`;

function makeTitle(r: () => number) {
  const n = 1 + Math.floor(r() * 3);
  return Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
}

function fakeVideoId(n: number) {
  return `mock${String(n).padStart(7, '0')}`;
}

const ALBUMS = Array.from({ length: 16 }, (_, i) => {
  const r = rand(i + 100);
  const artist = ARTISTS[i % ARTISTS.length];
  return { id: `MPREb_mockAlbum${String(i).padStart(3, '0')}`, name: makeTitle(r), artist, year: String(2015 + (i % 10)) };
});

function makeTrack(n: number): Track {
  const r = rand(n * 7 + 3);
  const artist = ARTISTS[Math.floor(r() * ARTISTS.length)];
  const album = ALBUMS[Math.floor(r() * ALBUMS.length)];
  const feat = r() > 0.8 ? [ARTISTS[Math.floor(r() * ARTISTS.length)]] : [];
  const isVideo = r() > 0.75;
  return {
    videoId: fakeVideoId(n),
    title: makeTitle(r),
    artists: [artist, ...feat.filter((f) => f.id !== artist.id)],
    album: isVideo ? undefined : { name: album.name, id: album.id },
    duration: 120 + Math.floor(r() * 180),
    thumbnail: img(isVideo ? `v${n}` : album.id),
    explicit: r() > 0.85,
    isVideo,
    extra: isVideo ? `조회수 ${Math.floor(r() * 900) + 10}만회` : undefined,
  };
}

const trackCard = (t: Track): Card => ({
  kind: t.isVideo ? 'video' : 'song',
  id: t.videoId,
  title: t.title,
  subtitle: [t.isVideo ? '동영상' : '노래', t.artists.map((a) => a.name).join(', '), t.album?.name ?? t.extra]
    .filter(Boolean)
    .join(' • '),
  thumbnail: t.thumbnail,
  track: t,
});

const albumCard = (a: (typeof ALBUMS)[number]): Card => ({
  kind: 'album',
  id: a.id,
  title: a.name,
  subtitle: `앨범 • ${a.artist.name} • ${a.year}`,
  thumbnail: img(a.id),
});

const playlistCard = (i: number): Card => ({
  kind: 'playlist',
  id: `PLmockPlaylist${String(i).padStart(4, '0')}`,
  title: ['K-POP 히트곡', '집중할 때 듣는 음악', '드라이브 플레이리스트', '비 오는 날', '운동할 때', '새벽 감성', '2010년대 발라드', '최신 인디'][i % 8],
  subtitle: `재생목록 • OpenMusic • ${30 + i * 7}곡`,
  thumbnail: img(`pl${i}`),
});

const artistCard = (a: (typeof ARTISTS)[number], i: number): Card => ({
  kind: 'artist',
  id: a.id,
  title: a.name,
  subtitle: `구독자 ${100 + i * 37}만명`,
  thumbnail: img(a.id),
});

function tracksRange(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => makeTrack(start + i));
}

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const LYRICS = `밤하늘에 별을 세다가
너의 이름을 불러봐
조용히 스며드는 노래처럼
내 맘에 남아 있어

Oh, every night I'm dreaming of you
멀리 있어도 들려와
이 멜로디가 끝나지 않게
조금만 더 머물러줘

(후렴)
la la la, 너와 나의 노래
la la la, 다시 한 번 더
반짝이는 이 순간이
영원할 수 있다면`;

export const mockProvider: Provider = {
  async playlist(id) {
    await delay();
    const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const total = 60 + (seed % 90);
    const first = Math.min(total, 100);
    const detail: CollectionDetail = {
      kind: 'playlist',
      id,
      title: id.startsWith('RDCLAK') ? '오늘의 K-Pop 히트곡' : `테스트 재생목록 ${id.slice(-4)}`,
      subtitle: '재생목록 • 2024',
      secondSubtitle: `조회수 120만회 • ${total}곡 • 6시간 이상`,
      author: { name: 'OpenMusic Curator' },
      description: '목 데이터로 생성된 재생목록입니다. 실제 서버에서는 YouTube Music의 재생목록 정보가 표시됩니다.',
      thumbnail: img(`pl-${id}`),
      year: '2024',
      tracks: tracksRange(seed, first),
      continuation: total > first ? `mock:${seed + first}:${total - first}` : undefined,
    };
    return detail;
  },

  async continuation(token) {
    await delay();
    const [, start, left] = token.split(':');
    const n = Math.min(Number(left), 100);
    const rest = Number(left) - n;
    return {
      tracks: tracksRange(Number(start), n),
      continuation: rest > 0 ? `mock:${Number(start) + n}:${rest}` : undefined,
    };
  },

  async album(id) {
    await delay();
    const a = ALBUMS.find((x) => x.id === id) ?? ALBUMS[0];
    const r = rand(id.length * 13);
    const count = 6 + Math.floor(r() * 8);
    const tracks: Track[] = Array.from({ length: count }, (_, i) => ({
      videoId: fakeVideoId(9000 + ALBUMS.indexOf(a) * 20 + i),
      title: makeTitle(rand(i * 31 + id.length)),
      artists: [a.artist],
      album: { name: a.name, id: a.id },
      duration: 150 + Math.floor(r() * 120),
      thumbnail: img(a.id),
      isVideo: false,
    }));
    const total = tracks.reduce((s, t) => s + (t.duration ?? 0), 0);
    return {
      kind: 'album',
      id: a.id,
      title: a.name,
      subtitle: `앨범 • ${a.year}`,
      secondSubtitle: `${count}곡 • ${Math.round(total / 60)}분`,
      author: a.artist,
      thumbnail: img(a.id),
      year: a.year,
      tracks,
      related: [
        {
          title: '이 아티스트의 다른 앨범',
          layout: 'carousel',
          items: ALBUMS.filter((x) => x.artist.id === a.artist.id && x.id !== a.id).map(albumCard),
        },
      ],
    };
  },

  async artist(id) {
    await delay();
    const idx = Math.max(0, ARTISTS.findIndex((a) => a.id === id));
    const a = ARTISTS[idx];
    const songs = tracksRange(idx * 50 + 500, 5).map((t) => ({ ...t, artists: [a], extra: `${idx + 3}억회 재생` }));
    const detail: ArtistDetail = {
      id: a.id,
      name: a.name,
      thumbnail: img(a.id),
      subscribers: `구독자 ${120 + idx * 40}만명`,
      description: `${a.name}의 아티스트 페이지입니다. (목 데이터)`,
      songs,
      songsPlaylistId: `OLAK5uy_mockSongs${idx}`,
      sections: [
        { title: '앨범', layout: 'carousel', items: ALBUMS.filter((x) => x.artist.id === a.id).map(albumCard) },
        { title: '싱글 및 EP', layout: 'carousel', items: ALBUMS.slice(0, 6).map(albumCard) },
        { title: '동영상', layout: 'carousel', items: tracksRange(idx * 50 + 700, 8).map((t) => trackCard({ ...t, isVideo: true, thumbnail: img(`v${t.videoId}`) })) },
        { title: '팬들이 좋아할 만한 콘텐츠', layout: 'carousel', items: ARTISTS.filter((x) => x.id !== a.id).map(artistCard) },
      ],
    };
    return detail;
  },

  async search(query, filter) {
    await delay();
    const seed = [...query].reduce((a, c) => a + c.charCodeAt(0), 0);
    const songs = tracksRange(seed, 20).filter((t) => !t.isVideo).map(trackCard);
    const videos = tracksRange(seed + 50, 12).map((t) => trackCard({ ...t, isVideo: true, album: undefined, thumbnail: img(`v${t.videoId}`) }));
    const albums = ALBUMS.slice(seed % 8, (seed % 8) + 6).map(albumCard);
    const playlists = Array.from({ length: 6 }, (_, i) => playlistCard(i + seed));
    const artists = ARTISTS.slice(0, 4).map(artistCard);
    const sections: Section[] = [];
    const add = (title: string, items: Card[], n: number) => sections.push({ title, layout: 'list', items: items.slice(0, n) });
    switch (filter) {
      case 'song':
        add('노래', songs, 20);
        break;
      case 'video':
        add('동영상', videos, 20);
        break;
      case 'album':
        add('앨범', albums, 20);
        break;
      case 'playlist':
        add('커뮤니티 재생목록', playlists, 20);
        break;
      case 'artist':
        add('아티스트', artists, 20);
        break;
      default:
        add('노래', songs, 4);
        add('동영상', videos, 3);
        add('앨범', albums, 3);
        add('커뮤니티 재생목록', playlists, 3);
        add('아티스트', artists, 3);
    }
    return { query, top: filter === 'all' ? artistCard(ARTISTS[seed % ARTISTS.length], 2) : undefined, sections };
  },

  async suggestions(query) {
    const q = query.trim();
    return {
      queries: q ? [q, `${q} 노래`, `${q} 플레이리스트`, `${q} 라이브`, `${q} 가사`] : [],
      items: q ? [artistCard(ARTISTS[q.length % ARTISTS.length], 1), trackCard(makeTrack(q.length * 11))] : [],
    };
  },

  async upNext(videoId) {
    await delay();
    const seed = videoId ? [...videoId].reduce((a, c) => a + c.charCodeAt(0), 0) : 1;
    const tracks = tracksRange(seed * 3 + 2000, 25);
    if (videoId) tracks.unshift({ ...makeTrack(Number(videoId.replace(/\D/g, '')) || 1), videoId });
    return { playlistId: `RDAMVM${videoId ?? ''}`, title: '뮤직 스테이션', tracks };
  },

  async lyrics(videoId) {
    await delay();
    if (videoId.endsWith('3')) return null;
    return { text: LYRICS, source: '출처: OpenMusic Mock Lyrics' };
  },

  async related(videoId) {
    await delay();
    const seed = [...videoId].reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      sections: [
        { title: '추천 노래', layout: 'carousel', items: tracksRange(seed + 3000, 12).map(trackCard) },
        { title: '추천 재생목록', layout: 'carousel', items: Array.from({ length: 6 }, (_, i) => playlistCard(i)) },
        { title: '비슷한 아티스트', layout: 'carousel', items: ARTISTS.map(artistCard) },
      ],
    };
  },

  async home() {
    await delay();
    return {
      sections: [
        { title: '빠른 선곡', strapline: '이 노래로 뮤직 스테이션 시작하기', layout: 'carousel', items: tracksRange(4000, 16).map(trackCard) },
        { title: '추천 앨범', layout: 'carousel', items: ALBUMS.map(albumCard) },
        { title: '믹스 플레이리스트', layout: 'carousel', items: Array.from({ length: 8 }, (_, i) => playlistCard(i)) },
        { title: '추천 뮤직비디오', layout: 'carousel', items: tracksRange(4100, 10).map((t) => trackCard({ ...t, isVideo: true, thumbnail: img(`v${t.videoId}`) })) },
        { title: '좋아하실 만한 아티스트', layout: 'carousel', items: ARTISTS.map(artistCard) },
      ],
    };
  },

  async explore() {
    await delay();
    return {
      sections: [
        { title: '최신 앨범 및 싱글', layout: 'carousel', items: [...ALBUMS].reverse().map(albumCard) },
        { title: '인기곡', layout: 'carousel', items: tracksRange(5000, 20).map(trackCard) },
        { title: '분위기 및 장르', layout: 'carousel', items: Array.from({ length: 8 }, (_, i) => playlistCard(i + 3)) },
        { title: '새로운 뮤직비디오', layout: 'carousel', items: tracksRange(5100, 10).map((t) => trackCard({ ...t, isVideo: true, thumbnail: img(`v${t.videoId}`) })) },
      ],
    };
  },
};

/** 목 썸네일: 시드에 따라 그라데이션 SVG 생성 */
export function mockImage(seed: string): string {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const h1 = h % 360;
  const h2 = (h1 + 40 + (h % 120)) % 360;
  const letter = seed.replace(/^(MPREb_mockAlbum|UCmockArtist0+|pl-?|v)/, '').slice(-2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="544" height="544" viewBox="0 0 544 544">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h1},70%,55%)"/><stop offset="1" stop-color="hsl(${h2},65%,25%)"/></linearGradient></defs>
<rect width="544" height="544" fill="url(#g)"/>
<circle cx="${150 + (h % 250)}" cy="${150 + ((h >> 4) % 250)}" r="${80 + (h % 90)}" fill="rgba(255,255,255,0.12)"/>
<text x="40" y="500" font-family="sans-serif" font-size="96" font-weight="700" fill="rgba(255,255,255,0.85)">${letter}</text>
</svg>`;
}
