// 임시 진단: NetEase 단어별 가사 / LRCLIB Enhanced LRC
import { neteaseWordLyrics } from '../../server/netease.ts';
const songs: [string, string, number][] = [
  ['Ditto', 'NewJeans', 186],
  ['Love wins all', 'IU', 272],
  ['アイドル', 'YOASOBI', 214],
  ['You & 合図', 'Otonose Kanade', 159],
  ['Supernova', 'aespa', 179],
  ['Blinding Lights', 'The Weeknd', 200],
];
const r0 = await fetch('https://music.163.com/api/search/get/web?s=Ditto&type=1&limit=3', { headers: { Referer: 'https://music.163.com/' } });
console.log(`PROBE raw search http=${r0.status} body=${(await r0.text()).slice(0, 200)}`);
for (const [t, a, d] of songs) {
  const t0 = Date.now();
  try {
    const r = await neteaseWordLyrics({ titles: [t], artist: a, duration: d });
    console.log(`PROBE ${t} / ${a}: ${Date.now() - t0}ms lines=${r?.lines.length ?? 0} dur=${r?.duration} first=${JSON.stringify(r?.lines[1])?.slice(0, 220)}`);
  } catch (e) {
    console.log(`PROBE ${t} ERROR ${(e as Error).message}`);
  }
  const lr = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: t, artist_name: a })}`).then((r) => r.json()).catch(() => []);
  const enh = (lr as any[]).filter((x) => x.syncedLyrics && /<\d+:\d+/.test(x.syncedLyrics)).length;
  console.log(`PROBE    lrclib results=${(lr as any[]).length} enhanced=${enh}`);
}
