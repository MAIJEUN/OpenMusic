// 임시 진단: NetEase yrc
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Referer: 'https://music.163.com/' };
for (const q of ['Ditto NewJeans', 'Love wins all IU', 'アイドル YOASOBI', 'Supernova aespa', 'Blinding Lights The Weeknd']) {
  const r = await fetch(`https://music.163.com/api/cloudsearch/pc?${new URLSearchParams({ s: q, type: '1', limit: '5', offset: '0' })}`, { headers: H });
  const j: any = await r.json();
  const songs: any[] = j?.result?.songs ?? [];
  console.log(`PROBE ${q}: ${songs.map((s) => `${s.id} ${s.name}/${(s.ar ?? []).map((a: any) => a.name).join(',')}/${Math.round(s.dt / 1000)}`).join(' | ')}`);
  for (const s of songs.slice(0, 2)) {
    for (const v of ['-1', '1']) {
      const lr = await fetch(`https://music.163.com/api/song/lyric/v1?${new URLSearchParams({ id: String(s.id), cp: 'false', lv: v, kv: v, tv: v, rv: v, yv: v, ytv: v, yrv: v })}`, { headers: H });
      const lj: any = await lr.json();
      const y = lj.yrc?.lyric ?? '';
      console.log(`PROBE    ${s.id} v=${v} keys=${Object.keys(lj).join(',')} yrc=${y.length} sample=${JSON.stringify(y.split('\n').find((l: string) => l.startsWith('[')))?.slice(0, 160)}`);
    }
  }
}
