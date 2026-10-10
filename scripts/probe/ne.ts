// 임시 진단: 단어별 가사 최종 확인
import { fetchLyrics } from '../../server/lyrics.ts';
import { Innertube } from 'youtubei.js';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const songs: [string, string, string, number][] = [
  ['4NRXx6U8ABQ', 'Blinding Lights', 'The Weeknd', 200],
  ['V6TEcoNUmc8', 'Ditto', 'NewJeans', 186],
  ['m9SMT5ipbxk', 'アイドル', 'YOASOBI', 214],
  ['x', 'Shape of You', 'Ed Sheeran', 234],
  ['y', 'Dynamite', 'BTS', 199],
];
for (const [id, title, artist, duration] of songs) {
  const t0 = Date.now();
  const ly = await fetchLyrics(yt, id, { title, artist, duration });
  const withWords = ly?.synced?.filter((l) => l.words).length ?? 0;
  console.log(`PROBE ${title}: ${Date.now() - t0}ms source=${ly?.source} lines=${ly?.synced?.length ?? 0} wordLines=${withWords} sample=${JSON.stringify(ly?.synced?.find((l) => l.words)?.words?.slice(0, 3))}`);
}
