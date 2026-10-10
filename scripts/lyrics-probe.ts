// 임시 진단 스크립트: 실제 가사 가져오기 확인
import { Innertube } from 'youtubei.js';
import { cleanTitle, fetchLyrics } from '../server/lyrics.ts';

const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
for (const query of ['NewJeans Ditto', '아이유 Love wins all', 'YOASOBI アイドル', '音乃瀬奏 You＆合図']) {
  try {
    const res: any = await yt.music.search(query, { type: 'song' });
    const item: any = res.contents?.[0]?.contents?.[0] ?? res.songs?.contents?.[0];
    const id = item?.id ?? item?.video_id;
    const title = item?.title?.toString?.() ?? item?.title;
    const artist = item?.artists?.map((a: any) => a.name).join(', ');
    const duration = item?.duration?.seconds;
    console.log(`PROBE ${query} → ${id} "${title}" / ${artist} / ${duration}s clean="${cleanTitle(String(title), artist)}"`);
    const t0 = Date.now();
    const ly = await fetchLyrics(yt, id, { title, artist, duration });
    console.log(`PROBE   ${Date.now() - t0}ms source=${ly?.source} synced=${ly?.synced?.length ?? 0} first=${JSON.stringify(ly?.synced?.slice(0, 2) ?? ly?.text?.slice(0, 40))}`);
  } catch (e) {
    console.log(`PROBE ${query} ERROR ${(e as Error).message.slice(0, 200)}`);
  }
}
// MV 제목 정리 + LRCLIB
const mv = '音乃瀬奏 - You＆合図 (Official MV)';
console.log(`PROBE clean MV: "${cleanTitle(mv, '音乃瀬奏 / Otonose Kanade')}"`);
const ly = await fetchLyrics(yt, '_xwOiIMM2a4', { title: mv, artist: 'Otonose Kanade', duration: 176 });
console.log(`PROBE MV source=${ly?.source} synced=${ly?.synced?.length ?? 0} first=${JSON.stringify(ly?.synced?.slice(0, 2) ?? ly?.text?.slice(0, 40))}`);
