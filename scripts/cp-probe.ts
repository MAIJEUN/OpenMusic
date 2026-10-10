// 임시 진단: 노래 ↔ 뮤직비디오 짝 응답 구조
import { Innertube } from 'youtubei.js';
import { findAll, findKey } from '../server/json.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
for (const id of process.argv.slice(2)) {
  const variants: Record<string, any> = {
    plain: { videoId: id, client: 'YTMUSIC' },
    radio: { videoId: id, playlistId: `RDAMVM${id}`, isAudioOnly: true, enablePersistentPlaylistPanel: true, tunerSettingValue: 'AUTOMIX_SETTING_NORMAL', client: 'YTMUSIC' },
    radioVideo: { videoId: id, playlistId: `RDAMVM${id}`, isAudioOnly: false, enablePersistentPlaylistPanel: true, client: 'YTMUSIC' },
  };
  for (const [name, body] of Object.entries(variants)) {
    try {
      const res = await yt.actions.execute('/next', body);
      const wrappers = findAll(res.data, 'playlistPanelVideoWrapperRenderer');
      const panels = findAll(res.data, 'playlistPanelVideoRenderer');
      const cps = findAll(res.data, 'counterpart');
      const first = panels[0];
      const w0 = wrappers[0];
      console.log(`PROBE ${id} [${name}] wrappers=${wrappers.length} panels=${panels.length} counterparts=${cps.length} firstPanel=${first?.videoId} type=${first?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType}`);
      if (w0) console.log(`PROBE    wrapper0 keys=${Object.keys(w0)} primary=${w0.primaryRenderer?.playlistPanelVideoRenderer?.videoId} cp=${JSON.stringify(w0.counterpart?.[0])?.slice(0, 400)}`);
      const seg = findKey(res.data, 'segmentMap');
      if (seg) console.log(`PROBE    segmentMap=${JSON.stringify(seg).slice(0, 300)}`);
    } catch (e) {
      console.log(`PROBE ${id} [${name}] ERROR ${(e as Error).message.slice(0, 200)}`);
    }
  }
}
