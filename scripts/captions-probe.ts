// 임시 진단 스크립트: 실제 YouTube에서 자막 목록/본문을 어떻게 받는지 확인
import { Innertube } from 'youtubei.js';
import { fetchCaptions } from '../server/captions.ts';

const ids = process.argv.slice(2);
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
for (const id of ids) {
  console.log(`\n===== ${id}`);
  for (const client of ['ANDROID', 'IOS', 'WEB', 'MWEB', 'TV', 'WEB_EMBEDDED'] as const) {
    try {
      const info: any = await yt.getBasicInfo(id, { client });
      const tracks: any[] = Array.from(info.captions?.caption_tracks ?? []);
      console.log(`[${client}] status=${info.playability_status?.status} reason=${info.playability_status?.reason ?? ''} tracks=${tracks.length}`);
      for (const t of tracks.slice(0, 6)) console.log(`   ${t.language_code} kind=${t.kind ?? '-'} name=${t.name?.toString()} url=${String(t.base_url).slice(0, 90)}`);
      const manual = tracks.find((t) => !t.kind) ?? tracks[0];
      if (manual) {
        for (const fmt of ['json3', '']) {
          const u = new URL(manual.base_url, 'https://www.youtube.com');
          if (fmt) u.searchParams.set('fmt', fmt);
          else u.searchParams.delete('fmt');
          const r = await fetch(u);
          const body = await r.text();
          console.log(`   timedtext(${fmt || 'default'}) ${manual.language_code}: http=${r.status} len=${body.length} head=${JSON.stringify(body.slice(0, 80))}`);
        }
      }
    } catch (e) {
      console.log(`[${client}] ERROR ${(e as Error).message.slice(0, 200)}`);
    }
  }
  try {
    const info: any = await yt.getInfo(id);
    const tr: any = await info.getTranscript();
    console.log(`[transcript] languages=${JSON.stringify(tr.languages)} selected=${tr.selectedLanguage} segs=${tr.transcript?.content?.body?.initial_segments?.length}`);
  } catch (e) {
    console.log(`[transcript] ERROR ${(e as Error).message.slice(0, 200)}`);
  }
  try {
    const res = await fetchCaptions(yt, id, undefined, 'ko');
    console.log(`[fetchCaptions] lang=${res?.lang} tracks=${JSON.stringify(res?.tracks)} lines=${res?.lines.length} first=${JSON.stringify(res?.lines[0])}`);
  } catch (e) {
    console.log(`[fetchCaptions] ERROR ${(e as Error).message}`);
  }
}
