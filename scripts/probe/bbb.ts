// 임시 진단: 커버곡 가사 (특정 영상 + 이전 사례)
import { Innertube } from 'youtubei.js';
import { fetchLyrics } from '../../server/lyrics.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const cases: [string, string, string, number][] = [
  ['vFDysagoQw0', '「Bling-Bang-Bang-Born」 - 音乃瀬奏（cover）', 'Kanade Ch. 音乃瀬奏 ‐ ReGLOSS', 171],
  ['x1', '밤편지 - 아이유 Cover By 레시피노트', '레시피노트', 248],
  ['x2', 'アイドル / YOASOBI【歌ってみた】by ツバサ『推しの子』OP', 'ツバサ【EL6】', 82],
  ['x3', 'Love wins all - 아이유(IU) Cover by 므므네 mumune', '그림프로 노래 저장소 (군대)', 279],
  ['x4', '【歌ってみた】KING / Kanaria【covered by 星街すいせい】', 'Suisei Channel', 220],
];
for (const [id, title, artist, duration] of cases) {
  const t0 = Date.now();
  const ly = await fetchLyrics(yt, id, { title, artist, duration });
  console.log(`PROBE "${title}" → ${Date.now() - t0}ms source=${ly?.source} original=${JSON.stringify(ly?.original)} synced=${ly?.synced?.length ?? 0} dur=${ly?.duration}`);
}
