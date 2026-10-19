import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { MdLogout, MdSync } from 'react-icons/md';
import type { ServerConfig } from '../../shared/types';
import { api, authApi } from '../lib/api';
import { syncNow } from '../lib/sync';
import { useAuth } from '../store/auth';
import { toast, useUi } from '../store/ui';
import { openMenuFromEvent } from './menus';

/* Google Identity Services (공식 'Google로 로그인' 버튼) */
interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gisPromise: Promise<GoogleId> | null = null;
function loadGis(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google 로그인을 불러오지 못했습니다.')));
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Google 로그인을 불러오지 못했습니다.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

function useAuthConfig(): ServerConfig['auth'] | null {
  const [cfg, setCfg] = useState<ServerConfig['auth'] | null>(null);
  useEffect(() => {
    api
      .config()
      .then((c) => setCfg(c.auth ?? null))
      .catch(() => {});
  }, []);
  return cfg;
}

const finishLogin = (r: { token: string; user: { name: string } }, done?: () => void) => {
  useAuth.getState().setSession(r.token, r.user as never);
  done?.();
  toast(`${r.user.name}님, 로그인했어요. 내 보관함을 동기화합니다`);
};

/** 로그인 창 내용 */
export function LoginPanel({ onDone }: { onDone: () => void }) {
  const cfg = useAuthConfig();
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const clientId = cfg?.googleClientId;
    if (!clientId || !btnRef.current) return;
    let alive = true;
    loadGis()
      .then((gis) => {
        if (!alive || !btnRef.current) return;
        gis.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (resp) => {
            authApi
              .loginWithGoogle(resp.credential)
              .then((r) => finishLogin(r, onDone))
              .catch((e) => setError((e as Error).message));
          },
        });
        gis.renderButton(btnRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko', width: 280 });
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [cfg, onDone]);

  return (
    <div className="login">
      <p className="modal__desc">
        로그인하면 내 재생목록·좋아요·사이드바에 등록한 재생목록을 다른 기기·브라우저에서도 그대로 쓸 수 있어요. 지금 이 브라우저에 있는 보관함은 로그인한 계정의 보관함과 합쳐집니다.
      </p>
      <div className="login__buttons">
        {cfg?.googleClientId && <div ref={btnRef} className="login__google" />}
        {cfg?.testLogin && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              authApi
                .testLogin()
                .then((r) => finishLogin(r, onDone))
                .catch((e) => setError((e as Error).message))
            }
          >
            테스트 계정으로 로그인
          </button>
        )}
        {cfg === null && <div className="spinner spinner--sm" />}
      </div>
      {error && <div className="link-form__error">{error}</div>}
      <p className="modal__note">이름·이메일·프로필 사진만 받아 오고, 보관함 동기화 외에는 쓰지 않아요.</p>
    </div>
  );
}

const ago = (t: number | null) => {
  if (!t) return '아직 안 함';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
};

/** 상단 바의 로그인 버튼 / 계정 버튼 */
export function AccountButton() {
  const cfg = useAuthConfig();
  const user = useAuth((s) => s.user);
  const sync = useAuth((s) => s.sync);
  const setDialog = useUi((s) => s.setDialog);
  if (!cfg) return null;

  if (!user) {
    return (
      <button type="button" className="btn btn--outline account-login" onClick={() => setDialog({ type: 'login' })}>
        로그인
      </button>
    );
  }

  const open = (e: MouseEvent) => {
    const a = useAuth.getState();
    const status = a.sync === 'syncing' ? '동기화 중…' : a.sync === 'error' ? `동기화 오류: ${a.syncError ?? ''}` : `마지막 동기화: ${ago(a.lastSyncedAt)}`;
    openMenuFromEvent(e, [
      { label: `${user.name}${user.email ? ` · ${user.email}` : ''}`, onSelect: () => {} },
      { label: status, icon: <MdSync />, onSelect: () => void syncNow() },
      'divider',
      {
        label: '로그아웃',
        icon: <MdLogout />,
        onSelect: () => {
          window.google?.accounts?.id.disableAutoSelect();
          useAuth.getState().clear();
          toast('로그아웃했어요. 이 브라우저의 보관함은 그대로 남아 있어요');
        },
      },
    ]);
  };

  return (
    <button type="button" className={`account-avatar ${sync === 'error' ? 'account-avatar--error' : ''}`} aria-label="계정" onClick={open}>
      {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{user.name.slice(0, 1)}</span>}
      {sync === 'syncing' && <i className="account-avatar__sync" />}
    </button>
  );
}
