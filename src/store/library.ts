import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../../shared/types';

export interface SavedCollection {
  kind: 'playlist' | 'album' | 'artist';
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  addedAt: number;
}

export interface LikedTrack extends Track {
  likedAt: number;
}

interface LibraryState {
  saved: SavedCollection[];
  recent: SavedCollection[];
  liked: LikedTrack[];
  disliked: string[];
  history: Track[];
  searches: string[];

  isSaved: (id: string) => boolean;
  toggleSaved: (c: Omit<SavedCollection, 'addedAt'>) => boolean;
  removeSaved: (id: string) => void;
  touchRecent: (c: Omit<SavedCollection, 'addedAt'>) => void;
  isLiked: (videoId: string) => boolean;
  isDisliked: (videoId: string) => boolean;
  toggleLike: (t: Track) => boolean;
  toggleDislike: (t: Track) => boolean;
  addHistory: (t: Track) => void;
  clearHistory: () => void;
  addSearch: (q: string) => void;
  removeSearch: (q: string) => void;
}

const MAX_HISTORY = 200;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      saved: [],
      recent: [],
      liked: [],
      disliked: [],
      history: [],
      searches: [],

      isSaved: (id) => get().saved.some((s) => s.id === id),
      toggleSaved: (c) => {
        const exists = get().isSaved(c.id);
        set((s) => ({
          saved: exists ? s.saved.filter((x) => x.id !== c.id) : [{ ...c, addedAt: Date.now() }, ...s.saved],
        }));
        return !exists;
      },
      removeSaved: (id) => set((s) => ({ saved: s.saved.filter((x) => x.id !== id) })),
      touchRecent: (c) =>
        set((s) => ({
          recent: [{ ...c, addedAt: Date.now() }, ...s.recent.filter((x) => x.id !== c.id)].slice(0, 24),
          // 저장된 항목의 제목/썸네일이 바뀌었으면 갱신
          saved: s.saved.map((x) => (x.id === c.id ? { ...x, ...c } : x)),
        })),

      isLiked: (id) => get().liked.some((t) => t.videoId === id),
      isDisliked: (id) => get().disliked.includes(id),
      toggleLike: (t) => {
        const liked = get().isLiked(t.videoId);
        set((s) => ({
          liked: liked ? s.liked.filter((x) => x.videoId !== t.videoId) : [{ ...t, likedAt: Date.now() }, ...s.liked],
          disliked: s.disliked.filter((id) => id !== t.videoId),
        }));
        return !liked;
      },
      toggleDislike: (t) => {
        const disliked = get().isDisliked(t.videoId);
        set((s) => ({
          disliked: disliked ? s.disliked.filter((id) => id !== t.videoId) : [...s.disliked, t.videoId],
          liked: s.liked.filter((x) => x.videoId !== t.videoId),
        }));
        return !disliked;
      },

      addHistory: (t) =>
        set((s) => ({ history: [t, ...s.history.filter((x) => x.videoId !== t.videoId)].slice(0, MAX_HISTORY) })),
      clearHistory: () => set({ history: [] }),

      addSearch: (q) => {
        const query = q.trim();
        if (!query) return;
        set((s) => ({ searches: [query, ...s.searches.filter((x) => x !== query)].slice(0, 20) }));
      },
      removeSearch: (q) => set((s) => ({ searches: s.searches.filter((x) => x !== q) })),
    }),
    {
      name: 'om-library',
      version: 1,
      partialize: (s) => ({
        saved: s.saved,
        recent: s.recent,
        liked: s.liked,
        disliked: s.disliked,
        history: s.history,
        searches: s.searches,
      }),
    },
  ),
);
