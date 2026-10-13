/**
 * 링크로 불러온 재생목록의 원본이 바뀌면(곡 추가·삭제·순서 변경) 재생 중인 대기열에도 반영한다.
 * - 재생목록 페이지를 열 때 (CollectionPage가 새로 받은 목록을 applyLatest로 넘긴다)
 * - 재생 중에는 몇 분마다, 그리고 다른 탭·앱에서 돌아왔을 때 원본을 다시 확인한다
 */
import { useEffect } from 'react';
import type { Track } from '../../shared/types';
import { isMixList } from '../../shared/links';
import { api, loadAllTracks } from '../lib/api';
import { LIKED_ID, isLocalId } from '../store/library';
import { player } from '../store/player';
import { toast } from '../store/ui';

/** 주기적으로 확인하는 간격 */
const INTERVAL_MS = 10 * 60_000;
/** 다른 탭·앱에서 돌아왔을 때는 이 정도 지났으면 확인 */
const RETURN_GAP_MS = 3 * 60_000;

/** 원본을 다시 확인할 수 있는 재생목록 ID (내 재생목록·좋아요·믹스·앨범은 제외) */
export function syncableListId(path?: string): string | null {
  const m = path?.match(/^\/playlist\?list=([^&]+)$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  if (id === LIKED_ID || isLocalId(id) || isMixList(id)) return null;
  return id;
}

const lastChecked = new Map<string, number>();

/** 원본 재생목록의 최신 전체 곡 목록 (중간에 실패하면 예외 — 일부만 받은 목록으로 곡을 지우면 안 된다) */
async function fetchLatest(id: string): Promise<Track[]> {
  return loadAllTracks(await api.playlistFresh(id));
}

/** 최신 곡 목록을 대기열에 반영하고, 바뀐 게 있으면 알려 준다 */
export function applyLatest(path: string, tracks: Track[]) {
  lastChecked.set(path, Date.now());
  const s = player();
  if (s.source?.path !== path) return;
  const r = s.syncFromSource(path, tracks);
  if (!r || (!r.added && !r.removed && !r.reordered)) return;
  const parts = [r.added && `${r.added}곡 추가`, r.removed && `${r.removed}곡 삭제`, r.reordered && '순서 변경'].filter(Boolean);
  toast(`'${s.source.title}' 원본 재생목록의 변경 사항을 반영했어요 (${parts.join(' · ')})`);
}

let checking = false;
async function check(minGap: number) {
  const s = player();
  const path = s.source?.path;
  const id = syncableListId(path);
  if (!path || !id || !s.queue.some((q) => q.from === path) || checking) return;
  if (Date.now() - (lastChecked.get(path) ?? 0) < minGap) return;
  checking = true;
  lastChecked.set(path, Date.now());
  try {
    const tracks = await fetchLatest(id);
    applyLatest(path, tracks);
  } catch {
    /* 네트워크 오류 등: 다음 확인 때 다시 */
  } finally {
    checking = false;
  }
}

export function usePlaylistSync() {
  useEffect(() => {
    // 새로고침 후 복원된 대기열도 한 번 확인
    const first = setTimeout(() => void check(0), 4000);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void check(INTERVAL_MS);
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(RETURN_GAP_MS);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
