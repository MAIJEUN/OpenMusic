/**
 * 런타임 독립적인 API 앱 (Hono). Node 서버(server/node.ts)와
 * Cloudflare Worker(worker/index.ts)가 같은 라우트를 공유한다.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SearchFilter, ServerConfig } from '../shared/types.js';
import type { Provider } from './provider.js';

const MIN = 60_000;

/** 이미지 중계를 허용하는 호스트 (YouTube/Google 썸네일 서버) */
const IMAGE_HOSTS = [/^i\d?\.ytimg\.com$/, /^(lh\d|yt\d)\.(googleusercontent|ggpht)\.com$/, /\.googleusercontent\.com$/, /\.ggpht\.com$/];

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createApp(provider: Provider, config: ServerConfig) {
  /* 간단한 메모리 캐시 (Worker에서는 isolate 단위로 유지된다) */
  const cache = new Map<string, { value: unknown; expires: number }>();
  async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await fn();
    if (cache.size >= 300) cache.delete(cache.keys().next().value as string);
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  }

  const need = (v: string | undefined, name: string) => {
    const s = v?.trim();
    if (!s) throw new HttpError(400, `${name} 값이 필요합니다.`);
    return s;
  };

  const app = new Hono().basePath('/api');

  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'], maxAge: 86400 }));

  // 브라우저/CDN 캐시 시간 (초)
  const ttl = (sec: number) => async (c: { header: (k: string, v: string) => void }, next: () => Promise<void>) => {
    await next();
    c.header('Cache-Control', `public, max-age=${sec}`);
  };

  app.get('/config', (c) => c.json(config));

  app.get('/playlist/:id', ttl(300), async (c) => {
    const id = need(c.req.param('id'), 'id');
    return c.json(await cached(`playlist:${id}`, 5 * MIN, () => provider.playlist(id)));
  });

  app.get('/continuation', ttl(300), async (c) => {
    const token = need(c.req.query('token'), 'token');
    return c.json(await cached(`cont:${token}`, 5 * MIN, () => provider.continuation(token)));
  });

  app.get('/album/:id', ttl(1800), async (c) => {
    const id = need(c.req.param('id'), 'id');
    return c.json(await cached(`album:${id}`, 30 * MIN, () => provider.album(id)));
  });

  app.get('/upnext', ttl(600), async (c) => {
    const v = c.req.query('v')?.trim() || undefined;
    const list = c.req.query('list')?.trim() || undefined;
    if (!v && !list) throw new HttpError(400, 'v 또는 list 값이 필요합니다.');
    return c.json(await cached(`upnext:${v}:${list}`, 10 * MIN, () => provider.upNext(v, list)));
  });

  app.get('/search', ttl(600), async (c) => {
    const q = need(c.req.query('q'), 'q');
    const filter: SearchFilter = c.req.query('filter') === 'video' ? 'video' : 'song';
    return c.json(await cached(`search:${filter}:${q}`, 10 * MIN, () => provider.search(q, filter)));
  });

  app.get('/lyrics/:id', ttl(3600), async (c) => {
    const id = need(c.req.param('id'), 'id');
    const str = (k: string) => c.req.query(k)?.trim().slice(0, 200) || undefined;
    const duration = Number(c.req.query('duration')) || undefined;
    const q = { title: str('title'), artist: str('artist'), album: str('album'), duration };
    const lyrics = await cached(`lyrics:${id}`, 60 * MIN, () => provider.lyrics(id, q));
    return c.json(lyrics);
  });

  // 앨범 아트 색상 추출용 이미지 중계. 브라우저 캔버스로 픽셀을 읽으려면 CORS 허용이 필요한데
  // Google 이미지 서버는 이를 보장하지 않아서, 허용된 호스트의 이미지만 그대로 전달한다.
  app.get('/image', async (c) => {
    const raw = need(c.req.query('url'), 'url');
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      throw new HttpError(400, '잘못된 이미지 주소입니다.');
    }
    if (target.protocol !== 'https:' || !IMAGE_HOSTS.some((re) => re.test(target.hostname))) {
      throw new HttpError(400, '허용되지 않은 이미지 주소입니다.');
    }
    const upstream = await fetch(target.toString());
    const type = upstream.headers.get('Content-Type') ?? '';
    if (!upstream.ok || !type.startsWith('image/')) throw new HttpError(502, '이미지를 가져오지 못했습니다.');
    return new Response(upstream.body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' },
    });
  });

  app.notFound((c) => c.json({ error: '알 수 없는 API입니다.' }, 404));

  app.onError((err, c) => {
    const status = err instanceof HttpError ? err.status : 502;
    console.error('[api]', c.req.path, err.message);
    c.header('Cache-Control', 'no-store');
    return c.json(
      { error: status === 502 ? `YouTube Music에서 정보를 가져오지 못했습니다. (${err.message})` : err.message },
      status as 400,
    );
  });

  return app;
}
