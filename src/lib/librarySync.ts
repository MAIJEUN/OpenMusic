/**
 * 내 보관함(내 재생목록·좋아요·등록한 재생목록) 합치기.
 *
 * 여러 기기에서 바꾼 내용을 항목 단위로 합친다.
 * - 같은 항목이 양쪽에 있으면 더 나중에 바뀐 쪽 (내 재생목록: updatedAt, 좋아요: likedAt, 등록: addedAt)
 * - 한쪽에서 지운 항목은, 지운 시각이 그 항목이 마지막으로 바뀐 시각보다 나중이면 지운다
 * - 지운 기록은 90일 뒤 버린다
 */
import type { Deleted, LibraryData, LikedTrack, LocalPlaylist, SavedCollection } from '../store/library';

const KEEP_DELETED_MS = 90 * 86400_000;

export const emptyLibrary = (): LibraryData => ({ saved: [], playlists: [], liked: [], deleted: { saved: {}, playlists: {}, liked: {} } });

/** 서버에서 받은 데이터를 안전하게 읽는다 (모양이 다르면 빈 보관함) */
export function asLibrary(raw: unknown): LibraryData {
  const d = (raw ?? {}) as Partial<LibraryData>;
  const arr = <T,>(x: unknown) => (Array.isArray(x) ? (x as T[]) : []);
  const rec = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, number>) : {});
  return {
    saved: arr<SavedCollection>(d.saved),
    playlists: arr<LocalPlaylist>(d.playlists),
    liked: arr<LikedTrack>(d.liked),
    deleted: { saved: rec(d.deleted?.saved), playlists: rec(d.deleted?.playlists), liked: rec(d.deleted?.liked) },
  };
}

function mergeDeleted(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const cutoff = Date.now() - KEEP_DELETED_MS;
  for (const [k, v] of [...Object.entries(a), ...Object.entries(b)]) {
    if (v < cutoff) continue;
    if (!(k in out) || out[k] < v) out[k] = v;
  }
  return out;
}

function mergeItems<T>(a: T[], b: T[], key: (x: T) => string, time: (x: T) => number, deleted: Record<string, number>): T[] {
  const byKey = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const k = key(x);
    const cur = byKey.get(k);
    if (!cur || time(x) > time(cur)) byKey.set(k, x);
  }
  return [...byKey.values()].filter((x) => !(key(x) in deleted) || deleted[key(x)] < time(x));
}

export function mergeLibrary(a: LibraryData, b: LibraryData): LibraryData {
  const deleted: Deleted = {
    saved: mergeDeleted(a.deleted.saved, b.deleted.saved),
    playlists: mergeDeleted(a.deleted.playlists, b.deleted.playlists),
    liked: mergeDeleted(a.deleted.liked, b.deleted.liked),
  };
  return {
    // 화면에 보이는 순서: 최근 것이 위
    saved: mergeItems(a.saved, b.saved, (x) => x.id, (x) => x.addedAt ?? 0, deleted.saved).sort((x, y) => (y.addedAt ?? 0) - (x.addedAt ?? 0)),
    playlists: mergeItems(a.playlists, b.playlists, (x) => x.id, (x) => x.updatedAt ?? 0, deleted.playlists).sort(
      (x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0),
    ),
    liked: mergeItems(a.liked, b.liked, (x) => x.videoId, (x) => x.likedAt ?? 0, deleted.liked).sort((x, y) => (y.likedAt ?? 0) - (x.likedAt ?? 0)),
    deleted,
  };
}

/** 내용이 같은지 (순서 포함) */
export const sameLibrary = (a: LibraryData, b: LibraryData) => JSON.stringify(a) === JSON.stringify(b);
