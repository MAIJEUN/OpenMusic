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
await step('spotify album', async () => {
  const c = await spotifyCollection('sp:album:4kS7bSuU0Jm9LYMosFU2x5');
  log('sp album', c.title, '|', c.subtitle, '|', c.tracks.length, JSON.stringify(c.tracks[0]).slice(0, 200));
});
await step('spotify track', async () => {
  const c = await spotifyCollection('sp:track:11dFghVXANMlKmJXsNCbNl');
  log('sp track', c.title, '|', c.subtitle, '|', JSON.stringify(c.tracks[0]).slice(0, 250));
});
await step('spotify korean', async () => {
  const c = await spotifyCollection('sp:playlist:37i9dQZF1DX9tPFwDMOaN1'); // K-Pop Daebak
  log('sp kpop', c.title, c.tracks.length);
  for (const t of c.tracks.slice(0, 4)) {
    const m = await youtubeProvider.match({ title: t.title, artist: t.artists.map((a) => a.name).join(', '), duration: t.duration });
    log('  match', `${t.title} / ${t.artists.map((a) => a.name).join(', ')} (${t.duration}s)`, '=>', m ? `${m.videoId} ${m.title} / ${m.artists.map((a) => a.name).join(', ')} (${m.duration}s) video=${m.isVideo}` : 'NONE');
  }
});

let first = '';
await step('sc search', async () => {
  const r = await scSearch('lofi hip hop');
  log('sc search', r.length, r.slice(0, 3).map((t) => `${t.videoId} ${t.title} / ${t.artists[0].name} ${t.duration}s ${t.url} ${t.thumbnail?.slice(0, 50)}`));
  first = r.find((t) => t.url)?.url ?? '';
});
await step('sc track link', async () => {
  const path = first.replace('https://soundcloud.com/', '');
  const c = await scCollection(`sc:${path}`);
  log('sc track', c.title, '|', c.subtitle, '|', c.tracks.length);
});
await step('sc set', async () => {
  const r = await fetch(`https://soundcloud.com/${first.replace('https://soundcloud.com/', '').split('/')[0]}/sets`).then((x) => x.text());
  const set = /href="(\/[\w-]+\/sets\/[\w-]+)"/.exec(r)?.[1];
  log('found set', set);
  if (set) {
    const c = await scCollection(`sc:${set.slice(1)}`);
    log('sc set', c.title, '|', c.subtitle, '|', c.tracks.length, c.tracks.slice(-1).map((t) => t.title));
  }
});
await step('sc user', async () => {
  const c = await scCollection(`sc:${first.replace('https://soundcloud.com/', '').split('/')[0]}`);
  log('sc user', c.title, '|', c.subtitle, '|', c.tracks.length);
});
await step('sc lyrics', async () => {
  const r = await scSearch('Adele Hello');
  const t = r[0];
  log('sc pick', t?.videoId, t?.title, t?.artists[0].name, t?.duration);
  if (t) {
    const ly = await youtubeProvider.lyrics(t.videoId, { title: t.title, artist: t.artists[0].name, duration: t.duration });
    log('sc lyrics', ly ? `${ly.source} synced=${ly.synced?.length ?? 0}` : 'none');
  }
});
