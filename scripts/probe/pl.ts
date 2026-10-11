// 임시 진단: 재생목록 페이지 처리 CPU 시간
import { youtubeProvider } from '../../server/youtube.ts';
const cpu = async <T>(fn: () => Promise<T>) => {
  const c0 = process.cpuUsage();
  const t0 = Date.now();
  const r = await fn();
  const c = process.cpuUsage(c0);
  return { r, cpuMs: Math.round((c.user + c.system) / 1000), wallMs: Date.now() - t0 };
};
// 첫 호출은 세션 생성 포함이라 따로 잰다
const warm = await cpu(() => youtubeProvider.playlist('PL2HEDIx6Li8hDUxaa-0cLX2tNrx_brV7G'));
console.log(`PROBE first playlist cpu=${warm.cpuMs}ms wall=${warm.wallMs}ms tracks=${warm.r.tracks.length}`);
const again = await cpu(() => youtubeProvider.playlist('PL21a_Jsowir3gv-51Be5BQzWl7nxrNeE9'));
console.log(`PROBE playlist(warm) cpu=${again.cpuMs}ms wall=${again.wallMs}ms`);
let token = again.r.continuation;
for (let i = 0; i < 4 && token; i++) {
  const p = await cpu(() => youtubeProvider.continuation(token!));
  console.log(`PROBE continuation cpu=${p.cpuMs}ms wall=${p.wallMs}ms +${p.r.tracks.length}`);
  token = p.r.continuation;
}
