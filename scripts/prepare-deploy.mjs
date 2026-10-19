/**
 * 배포 직전에 wrangler.toml을 채운다 (GitHub Actions에서 실행).
 * - 저장소 Variables의 GOOGLE_CLIENT_ID → [vars] (Google 로그인)
 * - 로그인한 사용자 데이터를 둘 Cloudflare KV 저장소를 (없으면 만들어서) 연결
 * 실패해도 배포는 계속한다 (그때는 로그인 기능만 꺼진다).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'openmusic-userdata';
const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const findNs = () => {
  const list = JSON.parse(run('npx wrangler kv namespace list'));
  return list.find((n) => n.title === TITLE || n.title.endsWith(`-${TITLE}`));
};

let toml = readFileSync('wrangler.toml', 'utf8');

const clientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
if (clientId) {
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    console.log(`::warning::GOOGLE_CLIENT_ID 형식이 이상합니다 (…apps.googleusercontent.com 이어야 함): ${clientId}`);
  }
  toml = toml.replace(/^\[vars\]\s*$/m, `[vars]\nGOOGLE_CLIENT_ID = "${clientId}"`);
  console.log('Google 로그인: 사용');
} else {
  console.log('Google 로그인: 꺼짐 (저장소 Variables에 GOOGLE_CLIENT_ID가 없음)');
}

if (process.env.SKIP_KV) {
  console.log('KV: 건너뜀 (SKIP_KV)');
} else {
  try {
    let ns = findNs();
    if (!ns) {
      console.log(`KV 저장소 만들기: ${TITLE}`);
      run(`npx wrangler kv namespace create ${TITLE}`);
      ns = findNs();
    }
    if (!ns) throw new Error('만든 저장소를 찾지 못했습니다.');
    toml += `\n# 로그인한 사용자 데이터 (scripts/prepare-deploy.mjs가 배포할 때 넣음)\n[[kv_namespaces]]\nbinding = "USERDATA"\nid = "${ns.id}"\n`;
    console.log(`KV: ${ns.title} (${ns.id})`);
  } catch (e) {
    const msg = String(e.stderr || e.message || e).split('\n').slice(0, 3).join(' ');
    console.log(`::warning::사용자 데이터 저장소(KV)를 준비하지 못해 로그인 기능 없이 배포합니다. Cloudflare API 토큰에 'Workers KV Storage: Edit' 권한이 있는지 확인해 주세요. (${msg})`);
  }
}

writeFileSync('wrangler.toml', toml);
