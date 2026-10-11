// 임시 진단: 실제 Spotify / SoundCloud 연동 확인 (확인 후 삭제)
import { spotifyCollection } from '../../server/spotify.js';
import { scCollection, scSearch } from '../../server/soundcloud.js';
import { youtubeProvider } from '../../server/youtube.js';

const log = (...a: unknown[]) => console.log('PROBE', ...a);
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    log(name, 'ERROR', (e as Error).message);
  }
}

await step('spotify playlist', async () => {
  const c = await spotifyCollection('sp:playlist:37i9dQZF1DXcBWIGoYBM5M');
  log('sp playlist', c.title, '|', c.subtitle, '|', c.tracks.length, 'tracks', '| thumb', c.thumbnail?.slice(0, 60));
  for (const t of c.tracks.slice(0, 5)) {
    const m = await youtubeProvider.match({ title: t.title, artist: t.artists.map((a) => a.name).join(', '), duration: t.duration });
    log('  match', `${t.title} / ${t.artists.map((a) => a.name).join(', ')} (${t.duration}s)`, '=>', m ? `${m.videoId} ${m.title} / ${m.artists.map((a) => a.name).join(', ')} (${m.duration}s) video=${m.isVideo}` : 'NONE');
  }
});
await step('spotify korean', async () => {
  const c = await spotifyCollection('sp:playlist:37i9dQZF1DX9tPFwDMOaN1'); // K-Pop Daebak
  log('sp kpop', c.title, c.tracks.length);
  for (const t of c.tracks.slice(0, 12)) {
    const m = await youtubeProvider.match({ title: t.title, artist: t.artists.map((a) => a.name).join(', '), duration: t.duration });
    log('  match', `${t.title} / ${t.artists.map((a) => a.name).join(', ')} (${t.duration}s)`, '=>', m ? `${m.videoId} ${m.title} / ${m.artists.map((a) => a.name).join(', ')} (${m.duration}s) video=${m.isVideo}` : 'NONE');
  }
});

for (const [title, artist, duration] of [['Hey Jude - Remastered 2015', 'The Beatles', 425], ['Dime Girl (Feat. NOWIMYOUNG)', 'YENA, NOWIMYOUNG', 148], ['밤편지', 'IU', 253]] as const) {
  const m = await youtubeProvider.match({ title, artist, duration });
  log('  match', title, '=>', m ? `${m.videoId} ${m.title} / ${m.artists.map((a) => a.name).join(', ')} (${m.duration}s) video=${m.isVideo}` : 'NONE');
}
