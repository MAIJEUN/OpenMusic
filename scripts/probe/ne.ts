// 임시 진단: NetEase 엔드포인트별 응답 형식
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Referer: 'https://music.163.com/' };
const q = 'Ditto NewJeans';
const tries: [string, string, RequestInit?][] = [
  ['cloudsearch/pc GET', `https://music.163.com/api/cloudsearch/pc?${new URLSearchParams({ s: q, type: '1', limit: '5', offset: '0' })}`],
  ['search/get GET', `https://music.163.com/api/search/get?${new URLSearchParams({ s: q, type: '1', limit: '5' })}`],
  ['search/pc POST', 'https://music.163.com/api/search/pc', { method: 'POST', body: new URLSearchParams({ s: q, type: '1', limit: '5', offset: '0' }) }],
  ['interface search/get', `https://interface.music.163.com/api/search/get?${new URLSearchParams({ s: q, type: '1', limit: '5' })}`],
  ['search/suggest/web', `https://music.163.com/api/search/suggest/web?${new URLSearchParams({ s: q })}`],
];
let id: number | undefined;
for (const [name, url, init] of tries) {
  try {
    const r = await fetch(url, { ...init, headers: { ...H, ...(init?.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } });
    const text = await r.text();
    let songs: any[] = [];
    try {
      const j = JSON.parse(text);
      songs = j?.result?.songs ?? j?.result?.songs ?? [];
    } catch {}
    console.log(`PROBE [${name}] http=${r.status} songs=${songs.length} first=${songs[0] ? `${songs[0].id} ${songs[0].name} / ${(songs[0].ar ?? songs[0].artists ?? []).map((a: any) => a.name)} / ${songs[0].dt ?? songs[0].duration}` : text.slice(0, 120)}`);
    if (!id && songs[0]) id = songs[0].id;
  } catch (e) {
    console.log(`PROBE [${name}] ERROR ${(e as Error).message}`);
  }
}
if (id) {
  for (const url of [
    `https://music.163.com/api/song/lyric/v1?${new URLSearchParams({ id: String(id), lv: '0', yv: '0', tv: '0', rv: '0', kv: '0', cp: 'false' })}`,
    `https://music.163.com/api/song/lyric?${new URLSearchParams({ id: String(id), lv: '-1', kv: '-1', tv: '-1', yv: '-1' })}`,
  ]) {
    const r = await fetch(url, { headers: H });
    const t = await r.text();
    let info = t.slice(0, 120);
    try {
      const j = JSON.parse(t);
      info = `keys=${Object.keys(j)} yrc=${(j.yrc?.lyric ?? '').length} lrc=${(j.lrc?.lyric ?? '').length} yrcSample=${JSON.stringify((j.yrc?.lyric ?? '').split('\n').slice(2, 4))}`;
    } catch {}
    console.log(`PROBE lyric ${url.split('?')[0]} http=${r.status} ${info.slice(0, 400)}`);
  }
}
