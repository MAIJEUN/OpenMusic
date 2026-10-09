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
    thumbs: p.tracks.slice(0, 4).map((t) => t.thumbnail ?? `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`),
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

      isSaved: (id) => get().saved.some((s) => s.id === id),
      register: (c) =>
        set((s) =>
          s.saved.some((x) => x.id === c.id)
            ? { saved: s.saved.map((x) => (x.id === c.id ? { ...x, ...c } : x)) }
            : { saved: [{ ...c, addedAt: Date.now() }, ...s.saved] },
        ),
      remove: (id) => set((s) => ({ saved: s.saved.filter((x) => x.id !== id) })),

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
        set((s) => ({ playlists: s.playlists.filter((x) => x.id !== id) }));
        return p;
      },
      restorePlaylist: (p) =>
        set((s) => (s.playlists.some((x) => x.id === p.id) ? s : { playlists: [p, ...s.playlists] })),
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
        }));
        return !liked;
      },
    }),
    {
      name: 'om-library',
      version: 3,
      partialize: (s) => ({ saved: s.saved, playlists: s.playlists, liked: s.liked }),
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<{ saved: SavedCollection[]; playlists: LocalPlaylist[]; liked: LikedTrack[] }>;
        return {
          saved: (old.saved ?? []).filter((c) => c.kind === 'playlist' || c.kind === 'album'),
          playlists: old.playlists ?? [],
          liked: old.liked ?? [],
        };
      },
    },
  ),
);
