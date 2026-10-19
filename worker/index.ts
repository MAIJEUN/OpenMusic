/**
 * Cloudflare Worker 진입점.
 * - /api/* : YouTube Music 메타데이터 API (wrangler.toml의 alias로 youtubei.js가 cf-worker 빌드로 바뀐다)
 * - 그 외   : 빌드된 웹 앱(dist)을 정적 파일로 제공 (SPA 경로는 index.html)
 */
import { createApp } from '../server/app.js';
import { youtubeProvider, ytOptions } from '../server/youtube.js';
import { createAuth } from '../server/auth.js';

interface Env {
  ASSETS: Fetcher;
  YT_LANG?: string;
  YT_LOCATION?: string;
  /** 로그인한 사용자 데이터 저장소 (배포할 때 자동으로 만든다). 없으면 로그인 기능이 꺼진다 */
  USERDATA?: KVNamespace;
  /** Google OAuth 클라이언트 ID (저장소 Variables의 GOOGLE_CLIENT_ID) */
  GOOGLE_CLIENT_ID?: string;
  /** (선택) 세션 서명 키. 없으면 저장소에 자동으로 만든 키를 쓴다 */
  SESSION_SECRET?: string;
}

let app: ReturnType<typeof createApp> | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (!app) {
      ytOptions.lang = env.YT_LANG ?? ytOptions.lang;
      ytOptions.location = env.YT_LOCATION ?? ytOptions.location;
      const kv = env.USERDATA;
      const auth =
        kv && env.GOOGLE_CLIENT_ID
          ? createAuth({
              store: { get: (k) => kv.get(k), put: (k, v) => kv.put(k, v) },
              googleClientId: env.GOOGLE_CLIENT_ID,
              sessionSecret: env.SESSION_SECRET,
            })
          : undefined;
      app = createApp(youtubeProvider, { mock: false, ...ytOptions }, auth);
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
