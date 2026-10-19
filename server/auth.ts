/**
 * Google 로그인 + 사용자 데이터 동기화.
 *
 * - 브라우저가 Google 로그인(Google Identity Services)으로 받은 ID 토큰을 보내면,
 *   서버가 Google 공개키로 서명·발급처·대상(클라이언트 ID)·만료를 확인하고 이 사이트의 세션 토큰을 준다.
 * - 세션 토큰은 사용자 정보를 HMAC-SHA256으로 서명한 문자열이라 서버에 세션을 저장하지 않는다.
 *   서명 키는 SESSION_SECRET 환경 변수가 있으면 그걸, 없으면 저장소에 한 번 만들어 둔 무작위 키를 쓴다.
 * - 사용자 데이터(내 재생목록·좋아요·등록한 재생목록)는 키-값 저장소(Cloudflare KV 등)에 사용자별로 저장한다.
 *   동시에 여러 기기에서 저장할 때 덮어쓰지 않도록 버전(rev)이 맞을 때만 저장한다.
 */
import type { AuthUser, SyncDoc } from '../shared/types.js';

/** 사용자 데이터를 둘 키-값 저장소 */
export interface UserStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** 메모리 저장소 (개발·목 데이터 모드) */
export function memoryStore(): UserStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
  };
}

export interface AuthOptions {
  store: UserStore;
  /** Google OAuth 클라이언트 ID (웹 애플리케이션). 없으면 Google 로그인은 꺼진다 */
  googleClientId?: string;
  sessionSecret?: string;
  /** 목 데이터 모드: Google 없이 테스트 계정으로 로그인 */
  allowTestLogin?: boolean;
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const utf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/* ---------------------------- Google ID 토큰 확인 ---------------------------- */

interface Jwk extends JsonWebKey {
  kid: string;
}
let jwks: { keys: Jwk[]; expires: number } | null = null;

async function googleKeys(force = false): Promise<Jwk[]> {
  if (!force && jwks && jwks.expires > Date.now()) return jwks.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('Google 공개키를 받지 못했습니다.');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? 3600);
  const body = (await res.json()) as { keys: Jwk[] };
  jwks = { keys: body.keys, expires: Date.now() + maxAge * 1000 };
  return body.keys;
}

interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function verifyGoogleIdToken(token: string, clientId: string): Promise<GoogleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('잘못된 로그인 정보입니다.');
  const header = JSON.parse(utf8(fromB64url(parts[0]))) as { alg: string; kid: string };
  if (header.alg !== 'RS256') throw new Error('지원하지 않는 서명 방식입니다.');
  let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  // Google이 키를 바꾼 직후일 수 있어서 한 번 새로 받아 본다
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('로그인 서명을 확인할 수 없습니다.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('로그인 서명이 올바르지 않습니다.');
  const claims = JSON.parse(utf8(fromB64url(parts[1]))) as GoogleClaims;
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') throw new Error('Google 로그인이 아닙니다.');
  if (claims.aud !== clientId) throw new Error('이 사이트용 로그인이 아닙니다.');
  if (claims.exp * 1000 < Date.now() - 60_000) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  return claims;
}

/* ---------------------------- 세션 토큰 ---------------------------- */

/** 세션 유지 기간 */
const SESSION_DAYS = 90;

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

interface Session extends AuthUser {
  exp: number;
}

export function createAuth(opts: AuthOptions) {
  let secret: Promise<string> | null = null;
  const getSecret = () => {
    if (opts.sessionSecret) return Promise.resolve(opts.sessionSecret);
    if (!secret) {
      secret = (async () => {
        const saved = await opts.store.get('meta:session-secret');
        if (saved) return saved;
        const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
        await opts.store.put('meta:session-secret', fresh);
        return fresh;
      })().catch((e) => {
        secret = null;
        throw e;
      });
    }
    return secret;
  };

  async function issue(user: AuthUser): Promise<string> {
    const body = b64url(enc.encode(JSON.stringify({ ...user, exp: Date.now() + SESSION_DAYS * 86400_000 } satisfies Session)));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(await getSecret()), enc.encode(body));
    return `${body}.${b64url(sig)}`;
  }

  async function verify(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    try {
      const ok = await crypto.subtle.verify('HMAC', await hmacKey(await getSecret()), fromB64url(sig), enc.encode(body));
      if (!ok) return null;
      const s = JSON.parse(utf8(fromB64url(body))) as Session;
      if (s.exp < Date.now()) return null;
      return { id: s.id, email: s.email, name: s.name, picture: s.picture };
    } catch {
      return null;
    }
  }

  async function loginWithGoogle(credential: string): Promise<{ token: string; user: AuthUser }> {
    if (!opts.googleClientId) throw new Error('Google 로그인이 설정되지 않았습니다.');
    const c = await verifyGoogleIdToken(credential, opts.googleClientId);
    const user: AuthUser = { id: `g:${c.sub}`, email: c.email, name: c.name ?? c.email ?? 'Google 사용자', picture: c.picture };
    return { token: await issue(user), user };
  }

  async function testLogin(): Promise<{ token: string; user: AuthUser }> {
    const user: AuthUser = { id: 'test:1', email: 'test@example.com', name: '테스트 사용자' };
    return { token: await issue(user), user };
  }

  /* 사용자 데이터 */
  const docKey = (user: AuthUser) => `user:${user.id}`;
  async function load(user: AuthUser): Promise<SyncDoc> {
    const raw = await opts.store.get(docKey(user));
    return raw ? (JSON.parse(raw) as SyncDoc) : { rev: 0, data: null };
  }
  /** baseRev가 지금 버전과 같을 때만 저장한다. 다르면 지금 저장된 문서를 돌려준다 */
  async function save(user: AuthUser, baseRev: number, data: unknown): Promise<{ ok: true; rev: number } | { ok: false; doc: SyncDoc }> {
    const cur = await load(user);
    if (cur.rev !== baseRev) return { ok: false, doc: cur };
    const rev = cur.rev + 1;
    await opts.store.put(docKey(user), JSON.stringify({ rev, data, updatedAt: Date.now() } satisfies SyncDoc));
    return { ok: true, rev };
  }

  return {
    enabled: !!opts.googleClientId || !!opts.allowTestLogin,
    googleClientId: opts.googleClientId,
    testLogin: opts.allowTestLogin ? testLogin : undefined,
    loginWithGoogle,
    verify,
    load,
    save,
  };
}

export type Auth = ReturnType<typeof createAuth>;
