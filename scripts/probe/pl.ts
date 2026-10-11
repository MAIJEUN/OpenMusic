// 임시 진단: 원본 JSON 해석 vs 기존 파서 (CPU·결과 비교)
import { Innertube, YTMusic } from 'youtubei.js';
import { rawContinuation, rawPlaylist } from '../../server/rawPlaylist.ts';
import { youtubeProvider } from '../../server/youtube.ts';
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
const cpu = async <T>(fn: () => Promise<T>) => {
  const c0 = process.cpuUsage();
  const r = await fn();
  const c = process.cpuUsage(c0);
  return { r, ms: Math.round((c.user + c.system) / 1000) };
};
for (const id of ['PL2HEDIx6Li8hDUxaa-0cLX2tNrx_brV7G', 'PL21a_Jsowir3gv-51Be5BQzWl7nxrNeE9', 'RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs']) {
  const raw = await cpu(() => rawPlaylist(yt, id));
  const d = raw.r;
  console.log(`PROBE raw ${id} cpu=${raw.ms}ms title="${d?.title}" sub="${d?.secondSubtitle}" author=${d?.author?.name} thumb=${!!d?.thumbnail} tracks=${d?.tracks.length} cont=${!!d?.continuation}`);
  console.log(`PROBE    t0=${JSON.stringify(d?.tracks[0])}`);
  // 같은 첫 페이지를 기존 파서로
  const old = await cpu(async () => {
    const pl = await yt.music.getPlaylist(id);
    return pl;
  });
  console.log(`PROBE old parser cpu=${old.ms}ms`);
  let token = d?.continuation;
  let total = d?.tracks.length ?? 0;
  for (let i = 0; i < 15 && token; i++) {
    const p = await cpu(() => rawContinuation(yt, token!));
    total += p.r?.tracks.length ?? 0;
    if (i < 3 || !p.r?.continuation) console.log(`PROBE    cont${i + 1} cpu=${p.ms}ms +${p.r?.tracks.length} total=${total} next=${!!p.r?.continuation}`);
    token = p.r?.continuation;
  }
}
const prov = await youtubeProvider.playlist('PL2HEDIx6Li8hDUxaa-0cLX2tNrx_brV7G');
console.log(`PROBE provider tracks=${prov.tracks.length} t5=${JSON.stringify(prov.tracks[5])}`);
