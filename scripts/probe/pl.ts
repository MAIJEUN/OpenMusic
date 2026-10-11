// 임시 진단: 큰 재생목록 이어받기
import { Innertube } from 'youtubei.js';
import { youtubeProvider } from '../../server/youtube.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const res: any = await yt.music.search('kpop 1000 songs playlist', { type: 'playlist' });
const items: any[] = (res.contents ?? []).flatMap((s: any) => Array.from(s.contents ?? []));
const ids: string[] = [];
for (const it of items.slice(0, 8)) {
  const id = it.id ?? it.endpoint?.payload?.browseId;
  console.log(`PROBE cand ${id} ${it.title?.toString?.() ?? it.title} | ${it.subtitle?.toString?.() ?? ''} | ${it.item_count ?? ''}`);
  if (id) ids.push(String(id).replace(/^VL/, ''));
}
for (const id of ids.slice(0, 3)) {
  try {
    const d = await youtubeProvider.playlist(id);
    let total = d.tracks.length;
    let token = d.continuation;
    console.log(`PROBE ${id} "${d.title}" sub="${d.secondSubtitle ?? d.subtitle}" first=${d.tracks.length} cont=${!!token}`);
    let pages = 0;
    while (token && pages++ < 20) {
      const p = await youtubeProvider.continuation(token);
      total += p.tracks.length;
      console.log(`PROBE    page${pages} +${p.tracks.length} total=${total} next=${!!p.continuation}`);
      token = p.continuation;
    }
  } catch (e) {
    console.log(`PROBE ${id} ERROR ${(e as Error).message.slice(0, 300)}`);
  }
}
// 원본 응답에서 첫 페이지 항목 수와 이어받기 정보
if (ids[0]) {
  const pl: any = await yt.music.getPlaylist(ids[0]);
  console.log(`PROBE raw items=${pl.items?.length} types=${[...new Set((pl.items ?? []).map((i: any) => i.type))]} has_continuation=${pl.has_continuation}`);
}
