// 임시 진단: 짝 찾기 중간 단계
import { Innertube } from 'youtubei.js';
import { findAll } from '../server/json.ts';
import { titleCandidates } from '../server/lyrics.ts';
import { youtubeProvider } from '../server/youtube.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
for (const id of process.argv.slice(2)) {
  const res = await yt.actions.execute('/next', { videoId: id, playlistId: `RDAMVM${id}`, isAudioOnly: true, enablePersistentPlaylistPanel: true, client: 'YTMUSIC' });
  const self = findAll(res.data, 'playlistPanelVideoRenderer').find((r: any) => r?.videoId === id);
  const title = self?.title?.runs?.map((r: any) => r.text).join('');
  const byline = self?.longBylineText?.runs?.map((r: any) => r.text).join('|');
  const len = self?.lengthText?.runs?.map((r: any) => r.text).join('');
  console.log(`PROBE ${id} self=${!!self} title="${title}" byline="${byline}" len=${len} cands=${JSON.stringify(titleCandidates(title ?? '', self?.longBylineText?.runs?.[0]?.text))}`);
  const type = self?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
  const want = type === 'MUSIC_VIDEO_TYPE_ATV' ? 'video' : 'song';
  const q = `${title} ${self?.longBylineText?.runs?.[0]?.text ?? ''}`;
  const r = await youtubeProvider.search(q, want as any);
  console.log(`PROBE   search(${want}) "${q}" → ${r.tracks.length}`);
  for (const t of r.tracks.slice(0, 5)) console.log(`PROBE     ${t.videoId} "${t.title}" / ${(t.artists ?? []).map((a) => a.name).join(', ')} / ${t.duration}`);
}
