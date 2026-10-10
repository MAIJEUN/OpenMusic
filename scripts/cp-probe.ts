// 임시 진단: 노래 ↔ 뮤직비디오 짝
import { youtubeProvider } from '../server/youtube.ts';
for (const id of process.argv.slice(2)) {
  try {
    const t0 = Date.now();
    const cp = await youtubeProvider.counterpart(id);
    console.log(`PROBE ${id} ${Date.now() - t0}ms → ${JSON.stringify(cp)?.slice(0, 400)}`);
  } catch (e) {
    console.log(`PROBE ${id} ERROR ${(e as Error).message.slice(0, 200)}`);
  }
}
