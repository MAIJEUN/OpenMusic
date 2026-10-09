import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { SearchFilter, ServerConfig } from '../shared/types.js';
import { mockImage, mockProvider } from './mock.js';
import type { Provider } from './provider.js';
import { youtubeProvider } from './youtube.js';

const MOCK = process.env.MOCK === '1' || process.argv.includes('--mock');
const PORT = Number(process.env.PORT ?? 3001);
const provider: Provider = MOCK ? mockProvider : youtubeProvider;

const app = express();
app.disable('x-powered-by');

/* ---------- 간단한 메모리 캐시 ---------- */
const cache = new Map<string, { value: unknown; expires: number }>();
const MAX_CACHE = 500;

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

const MIN = 60_000;

type Handler = (req: Request) => Promise<unknown>;
const route = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await fn(req);
    if (data === null || data === undefined) {
      res.status(404).json({ error: '찾을 수 없습니다.' });
      return;
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const required = (v: unknown, name: string) => {
  const s = str(v)?.trim();
  if (!s) throw Object.assign(new Error(`${name} 값이 필요합니다.`), { status: 400 });
  return s;
};

const FILTERS: SearchFilter[] = ['all', 'song', 'video', 'album', 'playlist', 'artist'];

/* ---------- API ---------- */
app.get(
  '/api/config',
  route(async () => {
    const config: ServerConfig = {
      mock: MOCK,
      lang: process.env.YT_LANG ?? 'ko',
      location: process.env.YT_LOCATION ?? 'KR',
    };
    return config;
  }),
);

app.get(
  '/api/playlist/:id',
  route(async (req) => {
    const id = required(req.params.id, 'id');
    // 첫 페이지만 캐시(이어받기 토큰은 일회성이므로 캐시된 응답에서는 제거하지 않고 재사용 시 새로 요청)
    return provider.playlist(id);
  }),
);

app.get('/api/continuation/:token', route(async (req) => provider.continuation(required(req.params.token, 'token'))));

app.get('/api/album/:id', route(async (req) => cached(`album:${req.params.id}`, 30 * MIN, () => provider.album(required(req.params.id, 'id')))));

app.get('/api/artist/:id', route(async (req) => cached(`artist:${req.params.id}`, 30 * MIN, () => provider.artist(required(req.params.id, 'id')))));

app.get(
  '/api/search',
  route(async (req) => {
    const q = required(req.query.q, 'q');
    const f = str(req.query.filter) as SearchFilter | undefined;
    const filter: SearchFilter = f && FILTERS.includes(f) ? f : 'all';
    return cached(`search:${filter}:${q}`, 10 * MIN, () => provider.search(q, filter));
  }),
);

app.get(
  '/api/suggestions',
  route(async (req) => {
    const q = str(req.query.q)?.trim() ?? '';
    if (!q) return { queries: [], items: [] };
    return cached(`suggest:${q}`, 10 * MIN, () => provider.suggestions(q));
  }),
);

app.get(
  '/api/upnext',
  route(async (req) => {
    const videoId = str(req.query.v)?.trim() || undefined;
    const list = str(req.query.list)?.trim() || undefined;
    return cached(`upnext:${videoId}:${list}`, 10 * MIN, () => provider.upNext(videoId, list));
  }),
);

app.get('/api/lyrics/:id', route(async (req) => cached(`lyrics:${req.params.id}`, 60 * MIN, () => provider.lyrics(required(req.params.id, 'id')))));

app.get('/api/related/:id', route(async (req) => cached(`related:${req.params.id}`, 30 * MIN, () => provider.related(required(req.params.id, 'id')))));

app.get('/api/home', route(async () => cached('home', 15 * MIN, () => provider.home())));

app.get('/api/explore', route(async () => cached('explore', 30 * MIN, () => provider.explore())));

if (MOCK) {
  app.get('/api/mock/img/:seed', (req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(mockImage(req.params.seed.replace(/\.svg$/, '')));
  });
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '알 수 없는 API입니다.' });
});

/* ---------- 정적 파일 (프로덕션 빌드) ---------- */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

/* ---------- 에러 처리 ---------- */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  const e = err as { status?: number; message?: string };
  const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
  console.error('[api]', e.message ?? err);
  res.status(status).json({ error: e.message ?? 'YouTube Music에서 정보를 가져오지 못했습니다.' });
});

app.listen(PORT, () => {
  console.log(`OpenMusic API 서버: http://localhost:${PORT}${MOCK ? ' (목 데이터 모드)' : ''}`);
  if (existsSync(dist)) console.log(`웹 앱: http://localhost:${PORT}`);
});
