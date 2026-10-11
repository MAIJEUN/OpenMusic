// 임시 진단: 원곡 찾기 회귀 + 가수 본인 곡
import { Innertube } from 'youtubei.js';
import { fetchLyrics } from '../../server/lyrics.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const cases: [string, string, string, number][] = [
  ['x0', 'iCONiC', 'ReGLOSS, Otonose Kanade, Ichijou Ririka', 240],
  ['CSVy1AlYnrQ', 'REALiZE / LiSA covered by ReGLOSS 【歌ってみた / hololive DEV_IS】', 'hololive ReGLOSS', 0],
  ['vFDysagoQw0', '「Bling-Bang-Bang-Born」 - 音乃瀬奏（cover）', 'Kanade Ch. 音乃瀬奏 ‐ ReGLOSS', 171],
  ['x4', '【歌ってみた】KING / Kanaria【covered by 星街すいせい】', 'Suisei Channel', 220],
  ['x1', '밤편지 - 아이유 Cover By 레시피노트', '레시피노트', 248],
  ['x2', 'アイドル / YOASOBI【歌ってみた】by ツバサ『推しの子』OP', 'ツバサ【EL6】', 82],
  ['x5', 'Ditto', 'NewJeans', 186],
];
for (const [id, title, artist, duration] of cases) {
  const t0 = Date.now();
  const ly = await fetchLyrics(yt, id, { title, artist, duration: duration || undefined });
  console.log(`PROBE "${title}" → ${Date.now() - t0}ms src=${ly?.source ?? 'NONE'}`);
}
