// 임시 진단: 노래 ↔ 뮤직비디오 짝
import { youtubeProvider } from '../server/youtube.ts';
const ids = process.argv.slice(2);
for (const id of ids) {
  try {
    const cp = await youtubeProvider.counterpart(id);
    console.log(`PROBE ${id} → ${JSON.stringify(cp)?.slice(0, 600)}`);
  } catch (e) {
    console.log(`PROBE ${id} ERROR ${(e as Error).message.slice(0, 200)}`);
  }
}
