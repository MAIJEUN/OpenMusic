// 임시 진단 스크립트
import { Innertube } from 'youtubei.js';

const q = process.argv[2];
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const res: any = await yt.search(q, { type: 'video' });
const vids: any[] = (res.videos ?? []).slice(0, 3);
for (const v of vids) console.log(`PROBE result ${v.video_id ?? v.id} ${v.title?.toString()}`);
const id = vids[0]?.video_id ?? vids[0]?.id;
for (const client of ['ANDROID', 'IOS', 'WEB'] as const) {
  try {
    const info: any = await yt.getBasicInfo(id, { client });
    const tracks: any[] = Array.from(info.captions?.caption_tracks ?? []);
    console.log(`PROBE [${client}] status=${info.playability_status?.status} tracks=${tracks.length}`);
    for (const t of tracks) {
      const u = new URL(t.base_url, 'https://www.youtube.com');
      u.searchParams.set('fmt', 'json3');
      const r = await fetch(u);
      const body = await r.text();
      console.log(`PROBE    ${t.vss_id} ${t.language_code} kind=${t.kind ?? '-'} name=${t.name?.toString()} xpe=${u.searchParams.get('exp')} http=${r.status} len=${body.length}`);
    }
  } catch (e) {
    console.log(`PROBE [${client}] ERROR ${(e as Error).message.slice(0, 150)}`);
  }
}
try {
  const info: any = await yt.getInfo(id);
  const tr: any = await info.getTranscript();
  console.log(`PROBE transcript languages=${JSON.stringify(tr.languages)} selected=${tr.selectedLanguage}`);
} catch (e) {
  console.log(`PROBE transcript ERROR ${(e as Error).message.slice(0, 150)}`);
}
