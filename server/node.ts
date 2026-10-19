/**
 * 로컬 개발/자체 호스팅용 Node 서버.
 *   npm run dev       → Vite(5173) + API(3001)
 *   npm run dev:mock  → 목 데이터로 실행 (YouTube 접속 불필요)
 *   npm run build && npm start → dist 정적 파일 + API를 한 포트에서 제공
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { createAuth, memoryStore, type UserStore } from './auth.js';
import { mockImage, mockProvider } from './mock.js';
import { youtubeProvider, ytOptions } from './youtube.js';

const MOCK = process.env.MOCK === '1' || process.argv.includes('--mock');
const PORT = Number(process.env.PORT ?? 3001);
ytOptions.lang = process.env.YT_LANG ?? ytOptions.lang;
ytOptions.location = process.env.YT_LOCATION ?? ytOptions.location;

const app = new Hono();

if (MOCK) {
  app.get('/api/mock/img/:seed', (c) =>
    c.body(mockImage(c.req.param('seed').replace(/\.svg$/, '')), 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    }),
  );
}

/** 자체 호스팅용 파일 저장소 (.data/userdata.json) */
function fileStore(file: string): UserStore {
  let data: Record<string, string> = {};
  try {
    data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    /* 처음 실행 */
  }
  return {
    get: async (k) => data[k] ?? null,
    put: async (k, v) => {
      data[k] = v;
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(data));
    },
  };
}

// 로그인: 목 데이터 모드는 Google 없이 테스트 계정으로, 아니면 GOOGLE_CLIENT_ID가 있을 때만
const googleClientId = process.env.GOOGLE_CLIENT_ID || undefined;
const auth =
  MOCK || googleClientId
    ? createAuth({
        store: MOCK ? memoryStore() : fileStore(path.resolve(process.env.DATA_DIR ?? '.data', 'userdata.json')),
        googleClientId,
        sessionSecret: process.env.SESSION_SECRET || undefined,
        allowTestLogin: MOCK,
      })
    : undefined;

app.route('/', createApp(MOCK ? mockProvider : youtubeProvider, { mock: MOCK, ...ytOptions }, auth));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
if (existsSync(path.join(dist, 'index.html'))) {
  const indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf8');
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }));
  app.get('*', (c) => c.html(indexHtml));
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`OpenMusic 서버: http://localhost:${PORT}${MOCK ? ' (목 데이터 모드)' : ''}`);
});
