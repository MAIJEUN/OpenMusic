/**
 * 개발/오프라인 테스트용 목 데이터 공급자. `MOCK=1` 또는 `--mock`으로 실행하면 사용된다.
 * 실제 YouTube에 접속하지 않고 UI 흐름 전체를 확인할 수 있다.
 */
import type { CollectionDetail, Track } from '../shared/types.js';
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
    // PLmockLive: 20초마다 원본이 바뀌는 재생목록 (원본 변경 반영 확인용) — 2번째 곡 삭제, 새 곡 추가, 마지막 두 곡 순서 바꿈
    if (id === 'PLmockLive') {
      const base = tracksRange(3000, 10);
      const changed = Math.floor(Date.now() / 20_000) % 2 === 1;
      const tracks = changed ? [base[0], base[2], makeTrack(3999), ...base.slice(3, 8), base[9], base[8]] : base;
      return { kind: 'playlist', id, title: '바뀌는 재생목록', subtitle: '재생목록', thumbnail: img('pl-live'), tracks };
    }
    // Spotify·SoundCloud 링크: 곡 ID만 그 서비스 형식으로 바꾼 목록
    if (id.startsWith('sp:') || id.startsWith('sc:')) {
      const sp = id.startsWith('sp:');
      const tracks = tracksRange(7000, 12).map((t, i) => ({
        ...t,
        videoId: sp ? `sp:mockSpotify${String(i).padStart(3, '0')}` : `sc:${900000 + i}`,
        // Spotify 재생목록은 곡별 앨범 아트가 없다. 3번째 곡은 YouTube에서 못 찾는 곡
        ...(sp ? { thumbnail: undefined, album: undefined, title: i === 2 ? `${t.title} (nomatch)` : t.title } : {}),
        isVideo: false,
        extra: sp ? undefined : 'SoundCloud',
      }));
      return {
        kind: 'playlist',
        id,
        title: sp ? 'Spotify 테스트 재생목록' : 'SoundCloud 테스트 재생목록',
        subtitle: sp ? 'Spotify • 재생목록' : 'SoundCloud • 재생목록',
        thumbnail: img(`pl-${id}`),
        tracks,
      };
    }
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
    };
  },

  async upNext(videoId) {
    await delay();
    const seed = videoId ? [...videoId].reduce((a, c) => a + c.charCodeAt(0), 0) : 1;
    const tracks = tracksRange(seed * 3 + 2000, 25);
    if (videoId) tracks.unshift({ ...makeTrack(Number(videoId.replace(/\D/g, '')) || 1), videoId });
    return { playlistId: `RDAMVM${videoId ?? ''}`, title: '뮤직 스테이션', tracks };
  },

  async search(query, filter) {
    await delay();
    const seed = [...query].reduce((a, c) => a + c.charCodeAt(0), 0);
    if (filter === 'soundcloud') {
      const tracks = tracksRange(seed * 7 + 8000, 15).map((t, i) => ({ ...t, videoId: `sc:${800000 + i}`, isVideo: false, album: undefined, extra: 'SoundCloud' }));
      return { query, filter, tracks };
    }
    const tracks = tracksRange(seed * 7 + 6000, 20).map((t) =>
      filter === 'video'
        ? { ...t, isVideo: true, album: undefined, extra: t.extra ?? '조회수 120만회', thumbnail: img(`v${t.videoId}`) }
        : { ...t, isVideo: false },
    );
    return { query, filter, tracks };
  },

  async loudness(q) {
    await delay();
    // 제목에 따라 -6 ~ -20 LUFS 사이의 음량 (조용한 곡·큰 곡 섞임)
    const n = [...q.title].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { loudness: -6 - (n % 15), source: 'mock', match: q.title };
  },

  async match(q) {
    await delay();
    // 'nomatch'가 들어간 곡은 못 찾은 것으로
    if (/nomatch/i.test(q.title)) return null;
    const n = [...q.title].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { ...makeTrack(n), title: q.title, artists: q.artist.split(/\s*,\s*/).map((name) => ({ name })), isVideo: false };
  },

  async counterpart(videoId) {
    await delay();
    // 끝자리 1: 뮤직비디오(앞에 8초 인트로)와 노래 버전 짝
    if (!videoId.endsWith('1')) return null;
    return {
      self: 'video',
      selfDuration: 252,
      other: { videoId: `${videoId}s`, kind: 'song', duration: 200, title: '(노래)' },
      // 시간 대응표 없음: 브라우저가 SponsorBlock 인트로 구간으로 추정한다
      segments: [],
    };
  },

  async lyrics(videoId) {
    await delay();
    if (videoId.endsWith('3')) return null;
    // 끝자리 5: 커버곡 → 원곡 가사 (길이가 달라 전체 가사로 시작)
    if (videoId.endsWith('5')) {
      const lines = LYRICS.split('\n')
        .filter((l) => l.trim() && !l.startsWith('('))
        .map((text, i) => ({ start: 6 + i * 4, end: 9.5 + i * 4, text }));
      return {
        text: LYRICS,
        source: '원곡 가사: 테스트 가수 - 원곡 · 출처: OpenMusic Mock Lyrics',
        synced: lines,
        original: {
          videoId: 'mockorig1',
          title: '원곡',
          artist: '테스트 가수',
          timingMatches: false,
          alternatives: [{ videoId: 'mockorig2', title: '원곡', artist: '다른 가수', duration: 201 }],
        },
      };
    }
    // 끝자리 1·2: 시간 동기화 가사 (6초부터 4초 간격)
    if (/[12]s?$/.test(videoId)) {
      const lines = LYRICS.split('\n')
        .filter((l) => l.trim() && !l.startsWith('('))
        .map((text, i) => {
          // 4번째 줄 뒤에 6초 간주
          const start = 6 + i * 4 + (i >= 4 ? 6 : 0);
          // 끝자리 2: 단어별 시간도 있음 (노래방 효과 확인용)
          const parts = text.split(/(?<= )/);
          const words = videoId.endsWith('2') ? parts.map((w, j) => ({ start: start + (j * 3) / parts.length, end: start + ((j + 1) * 3) / parts.length, text: w })) : undefined;
          return { start, end: start + 3.5, text, ...(words ? { words } : {}) };
        });
      return { text: LYRICS, source: '출처: OpenMusic Mock Lyrics (동기화)', synced: lines };
    }
    return { text: LYRICS, source: '출처: OpenMusic Mock Lyrics' };
  },

};

/** 목 썸네일: 시드에 따라 그라데이션 SVG 생성 */
export function mockImage(seed: string): string {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  // 시드가 한 글자만 달라도 색이 확실히 달라지도록 섞는다
  const mixed = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  const h1 = mixed % 360;
  const h2 = (h1 + 40 + (mixed % 120)) % 360;
  const letter = seed.replace(/^(MPREb_mockAlbum|UCmockArtist0+|pl-?|v)/, '').slice(-2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="544" height="544" viewBox="0 0 544 544">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h1},70%,55%)"/><stop offset="1" stop-color="hsl(${h2},65%,25%)"/></linearGradient></defs>
<rect width="544" height="544" fill="url(#g)"/>
<circle cx="${150 + (h % 250)}" cy="${150 + ((h >> 4) % 250)}" r="${80 + (h % 90)}" fill="rgba(255,255,255,0.12)"/>
<text x="40" y="500" font-family="sans-serif" font-size="96" font-weight="700" fill="rgba(255,255,255,0.85)">${letter}</text>
</svg>`;
}
