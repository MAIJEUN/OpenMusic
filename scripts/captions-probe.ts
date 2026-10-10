// 임시 진단 스크립트: 실제 YouTube에서 자막 목록/본문을 어떻게 받는지 확인
import { Innertube } from 'youtubei.js';
import { fetchCaptions } from '../server/captions.ts';

const [id, ...langs] = process.argv.slice(2);
const yt = await Innertube.create({ lang: 'ko', location: 'KR', retrieve_player: false, generate_session_locally: true });
for (const lang of [undefined, ...langs]) {
  const res = await fetchCaptions(yt, id, lang, 'ko');
  console.log(`PROBE lang=${lang} -> cur=${res?.lang} lines=${res?.lines.length} first=${JSON.stringify(res?.lines[0])}`);
  if (!lang) console.log(`PROBE tracks=${JSON.stringify(res?.tracks)}`);
}
