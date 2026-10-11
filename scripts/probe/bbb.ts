// 임시 진단: 커버곡 원곡 찾기
import { Innertube } from 'youtubei.js';
import { fetchLyrics, stripCover } from '../../server/lyrics.ts';
import { findAll } from '../../server/json.ts';
import { textOf, parseDuration } from '../../server/normalize.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
// REALiZE 커버 영상 찾기
const s: any = await yt.music.search('REALiZE LiSA covered by ReGLOSS', { type: 'video' });
const vids: any[] = Array.from(s.contents ?? []).flatMap((x: any) => Array.from(x?.contents ?? []));
const v = vids.find((x) => /ReGLOSS/i.test(x?.title?.toString?.() ?? '')) ?? vids[0];
const realizeId = v?.id ?? v?.video_id;
console.log(`PROBE realize video ${realizeId} "${v?.title?.toString?.()}"`);
const cases: [string, string, string, number][] = [];
for (const id of [realizeId, 'vFDysagoQw0']) {
  const res = await yt.actions.execute('/next', { videoId: id, client: 'YTMUSIC' });
  const self = findAll(res.data, 'playlistPanelVideoRenderer').find((r: any) => r?.videoId === id);
  cases.push([id, textOf(self?.title), String(self?.longBylineText?.runs?.[0]?.text ?? ''), parseDuration(textOf(self?.lengthText)) ?? 0]);
}
cases.push(['x4', '【歌ってみた】KING / Kanaria【covered by 星街すいせい】', 'Suisei Channel', 220]);
cases.push(['x1', '밤편지 - 아이유 Cover By 레시피노트', '레시피노트', 248]);
for (const [id, title, artist, duration] of cases) {
  const t0 = Date.now();
  const ly = await fetchLyrics(yt, id, { title, artist, duration });
  console.log(`PROBE "${title}" strip="${stripCover(title)}" → ${Date.now() - t0}ms src=${ly?.source} alts=${JSON.stringify(ly?.original?.alternatives?.map((a) => `${a.artist}-${a.title}`))}`);
}
// 사용자가 고른 원곡
const ly2 = await fetchLyrics(yt, 'zz', { title: 'x', artist: 'y', duration: 200, original: { videoId: 'V6TEcoNUmc8', title: 'Ditto', artist: 'NewJeans', duration: 186 } });
console.log(`PROBE chosen original → ${ly2?.source} synced=${ly2?.synced?.length}`);
