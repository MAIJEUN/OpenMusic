/**
 * 런타임 독립적인 API 앱 (Hono). Node 서버(server/node.ts)와
 * Cloudflare Worker(worker/index.ts)가 같은 라우트를 공유한다.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ServerConfig } from '../shared/types.js';
import type { Provider } from './provider.js';

const MIN = 60_000;

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

  app.get('/lyrics/:id', ttl(3600), async (c) => {
    const id = need(c.req.param('id'), 'id');
    const lyrics = await cached(`lyrics:${id}`, 60 * MIN, () => provider.lyrics(id));
    return c.json(lyrics);
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
