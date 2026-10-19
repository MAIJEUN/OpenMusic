/**
 * 로그인했을 때 내 보관함과 설정(재생 설정·곡별 가사 설정·음량 측정값)을 서버와 동기화한다.
 *
 * 한 번 동기화 = 서버 데이터 받기 → 이 기기 데이터와 항목 단위로 합치기 → 바뀌었으면 이 기기에 반영 → 서버에 저장.
 * 서버는 받은 버전(rev)이 그대로일 때만 저장하므로, 그 사이 다른 기기가 저장했으면 다시 받아서 합친다.
 *
 * 언제: 로그인 직후, 앱을 열 때, 보관함을 바꾼 뒤(잠깐 모았다가), 다른 탭·앱에서 돌아왔을 때, 그리고 몇 분마다.
 */
import { useEffect } from 'react';
import { ApiError, authApi } from './api';
import { asLibrary, mergeLibrary, sameLibrary } from './librarySync';
import { applyPrefs, asPrefs, localPrefs, mergePrefs, samePrefs } from './prefsSync';
import { useAuth } from '../store/auth';
import { useLibrary, type LibraryData } from '../store/library';
import { toast, useUi } from '../store/ui';
import { measuredClearedAt, onMeasured } from '../player/loudnessMeter';

const PUSH_DELAY_MS = 1500;
/** 음량 측정값은 듣는 동안 자주 바뀌어서 모았다가 가끔 저장한다 (저장 횟수 줄이기) */
const MEASURED_PUSH_DELAY_MS = 2 * 60_000;
const PULL_INTERVAL_MS = 3 * 60_000;

const localLibrary = (): LibraryData => {
  const s = useLibrary.getState();
  return { saved: s.saved, playlists: s.playlists, liked: s.liked, deleted: s.deleted };
};

/** 동기화 결과를 이 기기에 반영하는 중인지 (그 변경으로 다시 저장하지 않게) */
let applying = false;
let running: Promise<void> | null = null;
let again = false;

async function syncOnce(): Promise<void> {
  const { token } = useAuth.getState();
  if (!token) return;
  useAuth.getState().setSync('syncing');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const doc = await authApi.load(token);
      const remote = doc.data ? asLibrary(doc.data) : null;
      const local = localLibrary();
      const merged = remote ? mergeLibrary(local, remote) : mergeLibrary(local, local);
      // 설정 (예전에 저장된 데이터에는 없을 수 있다)
      const remotePrefs = doc.data ? asPrefs((doc.data as { prefs?: unknown }).prefs) : null;
      const lp = localPrefs();
      const mergedPrefs = remotePrefs ? mergePrefs(lp, remotePrefs) : mergePrefs(lp, lp);
      applying = true;
      try {
        if (!sameLibrary(merged, local)) useLibrary.getState().replaceAll(merged);
        if (!samePrefs(mergedPrefs, lp)) applyPrefs(lp, mergedPrefs);
      } finally {
        applying = false;
      }
      if (remote && remotePrefs && sameLibrary(merged, remote) && samePrefs(mergedPrefs, remotePrefs)) {
        break;
      }
      const r = await authApi.save(token, doc.rev, { ...merged, prefs: mergedPrefs });
      if (!r.conflict && typeof r.rev === 'number') {
        break;
      }
      // 그 사이 다른 기기가 저장함 → 다시 받아서 합친다
    }
    useAuth.getState().setSync('idle');
  } catch (err) {
    applying = false;
    if (err instanceof ApiError && err.status === 401) {
      useAuth.getState().clear();
      toast('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }
    useAuth.getState().setSync('error', (err as Error).message);
  }
}

/** 지금 동기화 (이미 하는 중이면 끝난 뒤 한 번 더) */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = syncOnce().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

export function useLibrarySync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPull = 0;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        lastPull = Date.now();
        void syncNow();
      }, PUSH_DELAY_MS);
    };
    const pull = (minGap: number) => {
      if (!useAuth.getState().token || Date.now() - lastPull < minGap) return;
      lastPull = Date.now();
      void syncNow();
    };

    // 보관함이 바뀌면 잠깐 모았다가 저장
    const unsubLib = useLibrary.subscribe((s, prev) => {
      if (applying || !useAuth.getState().token) return;
      if (s.saved === prev.saved && s.playlists === prev.playlists && s.liked === prev.liked && s.deleted === prev.deleted) return;
      schedule();
    });
    // 재생 설정·곡별 가사 설정이 바뀌면 같은 방식으로
    const unsubUi = useUi.subscribe((s, prev) => {
      if (applying || !useAuth.getState().token) return;
      if (s.playbackAt === prev.playbackAt && s.lyricsAt === prev.lyricsAt) return;
      schedule();
    });
    // 음량 측정값은 모았다가 (이미 예약돼 있으면 그대로 둔다)
    let lastCleared = measuredClearedAt();
    const unsubMeasured = onMeasured(() => {
      const cleared = measuredClearedAt();
      const clearedNow = cleared !== lastCleared;
      lastCleared = cleared;
      if (applying || !useAuth.getState().token) return;
      // '측정 기록 지우기'는 사용자가 한 일이라 바로 저장
      if (clearedNow) {
        schedule();
        return;
      }
      if (slowTimer) return;
      slowTimer = setTimeout(() => {
        slowTimer = null;
        void syncNow();
      }, MEASURED_PUSH_DELAY_MS);
    });
    // 로그인하면 바로
    const unsubAuth = useAuth.subscribe((s, prev) => {
      if (s.token && s.token !== prev.token) pull(0);
    });
    const onVisible = () => document.visibilityState === 'visible' && pull(30_000);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => document.visibilityState === 'visible' && pull(PULL_INTERVAL_MS), 60_000);
    pull(0);
    return () => {
      unsubLib();
      unsubUi();
      unsubMeasured();
      unsubAuth();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      if (slowTimer) clearTimeout(slowTimer);
    };
  }, []);
}
