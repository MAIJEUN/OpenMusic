// 임시 진단: 스포티파이 임베드 / 사운드클라우드 공개 API
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function spotify(kind: string, id: string) {
  const r = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, { headers: { 'User-Agent': UA } });
  const html = await r.text();
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return console.log(`PROBE spotify ${kind} http=${r.status} no NEXT_DATA len=${html.length}`);
  const data = JSON.parse(m[1]);
  const ent = data?.props?.pageProps?.state?.data?.entity;
  const list = ent?.trackList ?? [];
  console.log(`PROBE spotify ${kind} http=${r.status} name="${ent?.name ?? ent?.title}" sub="${ent?.subtitle}" tracks=${list.length} cover=${!!(ent?.coverArt ?? ent?.visualIdentity)}`);
  for (const t of list.slice(0, 3)) console.log(`PROBE    ${JSON.stringify(t).slice(0, 260)}`);
  if (!list.length) console.log(`PROBE    entity=${JSON.stringify(ent).slice(0, 600)}`);
}
await spotify('playlist', '37i9dQZF1DXcBWIGoYBM5M'); // Today's Top Hits
await spotify('album', '4kS7bSuU0Jm9LYMosFU2x5'); // 임의 앨범
await spotify('track', '11dFghVXANMlKmJXsNCbNl');
// 큰 재생목록
await spotify('playlist', '6UeSakyzhiEt4NB3UAd6NQ'); // Billboard Hot 100 (100+)

// 사운드클라우드 client_id
const home = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text();
const scripts = [...home.matchAll(/<script crossorigin src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
console.log(`PROBE sc home len=${home.length} scripts=${scripts.length}`);
let clientId = '';
for (const s of scripts.reverse()) {
  const js = await (await fetch(s)).text();
  const m = /client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/.exec(js) ?? /[?&]client_id=([a-zA-Z0-9]{32})/.exec(js);
  if (m) { clientId = m[1]; break; }
}
console.log(`PROBE sc client_id=${clientId ? clientId.slice(0, 6) + '…' : 'NONE'}`);
if (clientId) {
  const r = await fetch(`https://api-v2.soundcloud.com/search/tracks?${new URLSearchParams({ q: 'lofi hip hop', client_id: clientId, limit: '5' })}`, { headers: { 'User-Agent': UA } });
  const j: any = await r.json();
  for (const t of (j.collection ?? []).slice(0, 3)) console.log(`PROBE    sc ${t.id} "${t.title}" / ${t.user?.username} / ${Math.round(t.duration / 1000)}s art=${!!t.artwork_url} url=${t.permalink_url} policy=${t.policy} embeddable=${t.embeddable_by}`);
  const rs = await fetch(`https://api-v2.soundcloud.com/resolve?${new URLSearchParams({ url: 'https://soundcloud.com/lofi_girl/sets/lofi-hip-hop-radio', client_id: clientId })}`, { headers: { 'User-Agent': UA } });
  const rj: any = await rs.json().catch(() => ({}));
  console.log(`PROBE sc resolve http=${rs.status} kind=${rj.kind} title="${rj.title}" tracks=${rj.tracks?.length} track_count=${rj.track_count}`);
}
