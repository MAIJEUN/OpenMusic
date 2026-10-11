// 임시 진단: 특정 커버곡 가사
import { Innertube } from 'youtubei.js';
import { fetchLyrics, stripCover, titleCandidates } from '../../server/lyrics.ts';
import { findAll } from '../../server/json.ts';
import { textOf, parseDuration, trackFromListItem } from '../../server/normalize.ts';
import { youtubeProvider } from '../../server/youtube.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const id = 'vFDysagoQw0';
const res = await yt.actions.execute('/next', { videoId: id, client: 'YTMUSIC' });
const self = findAll(res.data, 'playlistPanelVideoRenderer').find((r: any) => r?.videoId === id);
const title = textOf(self?.title);
const artist = String(self?.longBylineText?.runs?.[0]?.text ?? '');
const dur = parseDuration(textOf(self?.lengthText));
console.log(`PROBE title="${title}" artist="${artist}" dur=${dur} byline="${textOf(self?.longBylineText)}"`);
console.log(`PROBE strip="${stripCover(title)}" cands=${JSON.stringify(titleCandidates(stripCover(title), artist))}`);
// 플레이리스트에서 온 트랙 정보
const pl = await youtubeProvider.playlist('PL6qjLH_5VIDUEA7yBOKxdRPdI4vYmL-dR');
const tr = pl.tracks.find((t) => t.videoId === id);
console.log(`PROBE playlist track=${JSON.stringify(tr)}`);
const cp = await youtubeProvider.counterpart(id).catch((e) => String(e));
console.log(`PROBE counterpart=${JSON.stringify(cp)}`);
for (const q of [stripCover(title), ...titleCandidates(stripCover(title), artist)]) {
  const s: any = await yt.music.search(q, { type: 'song' });
  const items: any[] = Array.from(s.contents ?? []).flatMap((x: any) => Array.from(x?.contents ?? []));
  console.log(`PROBE search "${q}": ${items.slice(0, 5).map((it) => { const t = trackFromListItem(it); return t ? `${t.title}/${t.artists.map((a) => a.name)}/${t.duration}` : '-'; }).join(' | ')}`);
}
const t0 = Date.now();
const ly = await fetchLyrics(yt, id, { title: tr?.title ?? title, artist: tr?.artists.map((a) => a.name).join(', ') ?? artist, duration: tr?.duration ?? dur });
console.log(`PROBE fetchLyrics ${Date.now() - t0}ms source=${ly?.source} original=${JSON.stringify(ly?.original)} synced=${ly?.synced?.length ?? 0} dur=${ly?.duration}`);
