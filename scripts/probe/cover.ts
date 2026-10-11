// 임시 진단: 커버곡 가사 → 원곡 가사
import { Innertube } from 'youtubei.js';
import { fetchLyrics } from '../../server/lyrics.ts';
import { trackFromListItem } from '../../server/normalize.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
for (const q of ['밤편지 cover', 'アイドル 歌ってみた', 'Ditto cover', 'Love wins all cover']) {
  const res: any = await yt.music.search(q, { type: 'video' });
  const items: any[] = Array.from(res.contents ?? []).flatMap((s: any) => Array.from(s?.contents ?? []));
  for (const it of items.slice(0, 2)) {
    const t = trackFromListItem(it);
    if (!t) continue;
    const artist = t.artists.map((a) => a.name).join(', ');
    const t0 = Date.now();
    const ly = await fetchLyrics(yt, t.videoId, { title: t.title, artist, duration: t.duration });
    console.log(`PROBE "${t.title}" / ${artist} / ${t.duration}s → ${Date.now() - t0}ms source=${ly?.source} original=${JSON.stringify(ly?.original)} synced=${ly?.synced?.length ?? 0} text=${JSON.stringify(ly?.text.slice(0, 30))}`);
  }
}
