/**
 * Cloudflare Worker 진입점. wrangler.toml의 alias로 youtubei.js가 cf-worker 빌드로 바뀐다.
 */
import { createApp } from '../server/app.js';
import { youtubeProvider, ytOptions } from '../server/youtube.js';

interface Env {
  YT_LANG?: string;
  YT_LOCATION?: string;
}

let app: ReturnType<typeof createApp> | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!app) {
      ytOptions.lang = env.YT_LANG ?? ytOptions.lang;
      ytOptions.location = env.YT_LOCATION ?? ytOptions.location;
      app = createApp(youtubeProvider, { mock: false, ...ytOptions });
    }

    // GET 응답은 Cloudflare 엣지 캐시에 저장해서 YouTube 요청과 CPU 사용량을 줄인다.
    const cache = (caches as unknown as { default: Cache }).default;
    if (request.method === 'GET') {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    const response = await app.fetch(request, env, ctx);
    if (request.method === 'GET' && response.ok && /max-age=\d+/.test(response.headers.get('Cache-Control') ?? '')) {
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  },
};
