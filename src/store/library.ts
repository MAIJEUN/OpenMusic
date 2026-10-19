import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../../shared/types';

/** 링크로 불러와 사이드바에 등록된 재생목록(또는 앨범). 읽기 전용 */
export interface SavedCollection {
  kind: 'playlist' | 'album';
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  addedAt: number;
}

/** 이 사이트에서 직접 만든 재생목록. 곡 추가/삭제/순서 변경 가능 */
export interface LocalPlaylist {
  id: string;
  title: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export interface LikedTrack extends Track {
  likedAt: number;
}

/**
 * 지운 항목과 지운 시각 (로그인 동기화용). 다른 기기의 예전 데이터와 합칠 때 지운 항목이 되살아나지 않게 한다.
 * saved: 재생목록 ID, playlists: 내 재생목록 ID, liked: 영상 ID
 */
export interface Deleted {
  saved: Record<string, number>;
  playlists: Record<string, number>;
  liked: Record<string, number>;
}

/** 로그인하면 동기화하는 내 보관함 */
export interface LibraryData {
  saved: SavedCollection[];
  playlists: LocalPlaylist[];
  liked: LikedTrack[];
  deleted: Deleted;
}

const emptyDeleted = (): Deleted => ({ saved: {}, playlists: {}, liked: {} });
const without = (m: Record<string, number>, key: string) => {
  if (!(key in m)) return m;
  const next = { ...m };
  delete next[key];
  return next;
};

/** 카드·메뉴 등에서 공통으로 쓰는 재생목록 정보 */
export interface CollectionInfo {
  kind: 'playlist' | 'album' | 'local' | 'liked';
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  /** 모자이크 커버용 썸네일 (내 재생목록) */
  thumbs?: string[];
}

export const LIKED_ID = 'LM';
const LOCAL_PREFIX = 'local-';

export const isLocalId = (id: string) => id.startsWith(LOCAL_PREFIX);

export function collectionPath(c: Pick<CollectionInfo, 'kind' | 'id'>): string {
  return c.kind === 'album' ? `/browse/${c.id}` : `/playlist?list=${encodeURIComponent(c.id)}`;
}

export function localInfo(p: LocalPlaylist): CollectionInfo {
  return {
    kind: 'local',
    id: p.id,
    title: p.title,
    subtitle: `내 재생목록 • ${p.tracks.length}곡`,
    thumbnail: p.tracks[0]?.thumbnail,
    thumbs: p.tracks
      .slice(0, 4)
      .map((t) => t.thumbnail ?? (t.videoId.includes(':') ? '' : `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`)),
  };
}

export function likedInfo(liked: LikedTrack[]): CollectionInfo {
  return { kind: 'liked', id: LIKED_ID, title: '좋아요 표시한 음악', subtitle: `자동 재생목록 • ${liked.length}곡` };
}

const stripLiked = ({ likedAt: _likedAt, ...t }: LikedTrack): Track => {
  void _likedAt;
  return t;
};
export const likedTracks = (liked: LikedTrack[]) => liked.map(stripLiked);

interface LibraryState {
  saved: SavedCollection[];
  playlists: LocalPlaylist[];
  liked: LikedTrack[];
  deleted: Deleted;
  /** 동기화로 받은 보관함으로 바꾼다 */
  replaceAll: (d: LibraryData) => void;

  isSaved: (id: string) => boolean;
  /** 등록하거나, 이미 등록돼 있으면 제목/썸네일만 갱신 */
  register: (c: Omit<SavedCollection, 'addedAt'>) => void;
  remove: (id: string) => void;

  createPlaylist: (title: string, tracks?: Track[]) => string;
  renamePlaylist: (id: string, title: string) => void;
  deletePlaylist: (id: string) => LocalPlaylist | undefined;
  restorePlaylist: (p: LocalPlaylist) => void;
  /** 이미 있는 곡은 건너뛴다. 추가된 곡 수를 돌려준다 */
  addToPlaylist: (id: string, tracks: Track[]) => number;
  removeFromPlaylist: (id: string, videoId: string) => void;
  movePlaylistTrack: (id: string, from: number, to: number) => void;

  isLiked: (videoId: string) => boolean;
  toggleLike: (t: Track) => boolean;
}

const uniqueByVideo = (tracks: Track[]) => {
  const seen = new Set<string>();
  return tracks.filter((t) => (seen.has(t.videoId) ? false : (seen.add(t.videoId), true)));
};

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      saved: [],
      playlists: [],
      liked: [],
      deleted: emptyDeleted(),
      replaceAll: (d) => set({ saved: d.saved, playlists: d.playlists, liked: d.liked, deleted: d.deleted }),

      isSaved: (id) => get().saved.some((s) => s.id === id),
      register: (c) =>
        set((s) => {
          const cur = s.saved.find((x) => x.id === c.id);
          if (cur) {
            // 제목·썸네일이 그대로면 바꾸지 않는다 (열 때마다 동기화가 일어나지 않게)
            const same = cur.title === c.title && cur.subtitle === c.subtitle && cur.thumbnail === c.thumbnail && cur.kind === c.kind;
            return same ? s : { saved: s.saved.map((x) => (x.id === c.id ? { ...x, ...c } : x)) };
          }
          return {
            saved: [{ ...c, addedAt: Date.now() }, ...s.saved],
            deleted: { ...s.deleted, saved: without(s.deleted.saved, c.id) },
          };
        }),
      remove: (id) =>
        set((s) => ({ saved: s.saved.filter((x) => x.id !== id), deleted: { ...s.deleted, saved: { ...s.deleted.saved, [id]: Date.now() } } })),

      createPlaylist: (title, tracks = []) => {
        const id = `${LOCAL_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const now = Date.now();
        const playlist: LocalPlaylist = {
          id,
          title: title.trim() || '새 재생목록',
          tracks: uniqueByVideo(tracks),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ playlists: [playlist, ...s.playlists] }));
        return id;
      },
      renamePlaylist: (id, title) =>
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === id ? { ...p, title: title.trim() || p.title, updatedAt: Date.now() } : p)),
        })),
      deletePlaylist: (id) => {
        const p = get().playlists.find((x) => x.id === id);
        set((s) => ({
          playlists: s.playlists.filter((x) => x.id !== id),
          deleted: { ...s.deleted, playlists: { ...s.deleted.playlists, [id]: Date.now() } },
        }));
        return p;
      },
      restorePlaylist: (p) =>
        set((s) =>
          s.playlists.some((x) => x.id === p.id)
            ? s
            : {
                // 되살린 시각을 새로 남겨서 다른 기기의 '삭제'보다 나중 일로 본다
                playlists: [{ ...p, updatedAt: Date.now() }, ...s.playlists],
                deleted: { ...s.deleted, playlists: without(s.deleted.playlists, p.id) },
              },
        ),
      addToPlaylist: (id, tracks) => {
        const p = get().playlists.find((x) => x.id === id);
        if (!p) return 0;
        const have = new Set(p.tracks.map((t) => t.videoId));
        const fresh = uniqueByVideo(tracks).filter((t) => !have.has(t.videoId));
        if (fresh.length) {
          set((s) => ({
            playlists: s.playlists.map((x) =>
              x.id === id ? { ...x, tracks: [...x.tracks, ...fresh], updatedAt: Date.now() } : x,
            ),
          }));
        }
        return fresh.length;
      },
      removeFromPlaylist: (id, videoId) =>
        set((s) => ({
          playlists: s.playlists.map((x) =>
            x.id === id ? { ...x, tracks: x.tracks.filter((t) => t.videoId !== videoId), updatedAt: Date.now() } : x,
          ),
        })),
      movePlaylistTrack: (id, from, to) =>
        set((s) => ({
          playlists: s.playlists.map((x) => {
            if (x.id !== id || from === to || from < 0 || to < 0 || from >= x.tracks.length || to >= x.tracks.length) return x;
            const tracks = x.tracks.slice();
            const [moved] = tracks.splice(from, 1);
            tracks.splice(to, 0, moved);
            return { ...x, tracks, updatedAt: Date.now() };
          }),
        })),

      isLiked: (videoId) => get().liked.some((t) => t.videoId === videoId),
      toggleLike: (t) => {
        const liked = get().isLiked(t.videoId);
        set((s) => ({
          liked: liked ? s.liked.filter((x) => x.videoId !== t.videoId) : [{ ...t, likedAt: Date.now() }, ...s.liked],
          deleted: {
            ...s.deleted,
            liked: liked ? { ...s.deleted.liked, [t.videoId]: Date.now() } : without(s.deleted.liked, t.videoId),
          },
        }));
        return !liked;
      },
    }),
    {
      name: 'om-library',
      version: 4,
      partialize: (s) => ({ saved: s.saved, playlists: s.playlists, liked: s.liked, deleted: s.deleted }),
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<LibraryData>;
        return {
          saved: (old.saved ?? []).filter((c) => c.kind === 'playlist' || c.kind === 'album'),
          playlists: old.playlists ?? [],
          liked: old.liked ?? [],
          deleted: old.deleted ?? emptyDeleted(),
        };
      },
    },
  ),
);
