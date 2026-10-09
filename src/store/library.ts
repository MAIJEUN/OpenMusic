import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 사이드바에 등록된 재생목록(또는 앨범) */
export interface SavedCollection {
  kind: 'playlist' | 'album';
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  addedAt: number;
}

export type CollectionInfo = Omit<SavedCollection, 'addedAt'>;

interface LibraryState {
  saved: SavedCollection[];
  isSaved: (id: string) => boolean;
  /** 등록하거나, 이미 등록돼 있으면 제목/썸네일만 갱신 */
  register: (c: CollectionInfo) => void;
  remove: (id: string) => void;
}

export function collectionPath(c: Pick<SavedCollection, 'kind' | 'id'>): string {
  return c.kind === 'album' ? `/browse/${c.id}` : `/playlist?list=${encodeURIComponent(c.id)}`;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      saved: [],
      isSaved: (id) => get().saved.some((s) => s.id === id),
      register: (c) =>
        set((s) =>
          s.saved.some((x) => x.id === c.id)
            ? { saved: s.saved.map((x) => (x.id === c.id ? { ...x, ...c } : x)) }
            : { saved: [{ ...c, addedAt: Date.now() }, ...s.saved] },
        ),
      remove: (id) => set((s) => ({ saved: s.saved.filter((x) => x.id !== id) })),
    }),
    {
      name: 'om-library',
      version: 2,
      partialize: (s) => ({ saved: s.saved }),
      // v1(보관함/좋아요/기록) 데이터에서는 저장한 재생목록·앨범만 가져온다
      migrate: (persisted) => {
        const old = (persisted ?? {}) as { saved?: SavedCollection[] };
        return { saved: (old.saved ?? []).filter((c) => c.kind === 'playlist' || c.kind === 'album') };
      },
    },
  ),
);
