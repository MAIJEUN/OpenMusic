import type { MouseEvent } from 'react';
import {
  MdDeleteOutline,
  MdDriveFileRenameOutline,
  MdFavorite,
  MdFavoriteBorder,
  MdLibraryAdd,
  MdPlaylistAdd,
  MdPlaylistPlay,
  MdQueueMusic,
  MdRemoveCircleOutline,
  MdShuffle,
} from 'react-icons/md';
import type { Track } from '../../shared/types';
import { collectionPath, isLocalId, useLibrary, type CollectionInfo } from '../store/library';
import { player } from '../store/player';
import { toast, useUi, type MenuState } from '../store/ui';

export function openMenuFromEvent(e: MouseEvent, items: MenuState['items']) {
  e.preventDefault();
  e.stopPropagation();
  if (e.type === 'contextmenu') {
    useUi.getState().openMenu({ x: e.clientX, y: e.clientY, items });
    return;
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  useUi.getState().openMenu({
    x: r.left,
    y: r.bottom,
    anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    items,
  });
}

/** 하트(좋아요) 토글 + 안내 */
export function toggleLikeWithToast(track: Track) {
  const now = useLibrary.getState().toggleLike(track);
  toast(now ? '좋아요 표시한 음악에 추가했습니다' : '좋아요 표시한 음악에서 삭제했습니다');
}

export const saveTracksTo = (tracks: Track[], suggestedTitle?: string) =>
  useUi.getState().setDialog({ type: 'saveTo', tracks, suggestedTitle });

interface TrackMenuOptions {
  /** 지금 재생목록(대기열) 항목이면 그 uid */
  queueUid?: string;
  /** 내 재생목록 화면에서 연 메뉴면 그 재생목록 ID (삭제 메뉴 표시) */
  playlistId?: string;
}

/** 곡 메뉴 */
export function trackMenuItems(track: Track, opts: TrackMenuOptions = {}): MenuState['items'] {
  const liked = useLibrary.getState().isLiked(track.videoId);
  const items: MenuState['items'] = [
    { label: '다음 곡으로 재생', icon: <MdPlaylistPlay />, onSelect: () => player().playNext([track]) },
    { label: '현재 재생목록에 추가', icon: <MdQueueMusic />, onSelect: () => player().addToQueue([track]) },
    { label: '재생목록에 저장', icon: <MdPlaylistAdd />, onSelect: () => saveTracksTo([track]) },
    {
      label: liked ? '좋아요 취소' : '좋아요',
      icon: liked ? <MdFavorite /> : <MdFavoriteBorder />,
      onSelect: () => toggleLikeWithToast(track),
    },
  ];
  if (opts.queueUid) {
    const uid = opts.queueUid;
    items.push('divider', { label: '현재 재생목록에서 삭제', icon: <MdRemoveCircleOutline />, onSelect: () => player().removeFromQueue(uid) });
  }
  if (opts.playlistId && isLocalId(opts.playlistId)) {
    const id = opts.playlistId;
    items.push('divider', {
      label: '이 재생목록에서 삭제',
      icon: <MdDeleteOutline />,
      onSelect: () => {
        const lib = useLibrary.getState();
        const p = lib.playlists.find((x) => x.id === id);
        const index = p?.tracks.findIndex((t) => t.videoId === track.videoId) ?? -1;
        lib.removeFromPlaylist(id, track.videoId);
        toast('재생목록에서 삭제했습니다', {
          actionLabel: '실행취소',
          action: () => {
            const l = useLibrary.getState();
            if (l.addToPlaylist(id, [track]) && index >= 0) {
              const len = l.playlists.find((x) => x.id === id)?.tracks.length ?? 0;
              l.movePlaylistTrack(id, len - 1, Math.min(index, len - 1));
            }
          },
        });
      },
    });
  }
  return items;
}

/** 내 재생목록 삭제: 바로 지우지 않고 확인 창을 띄운다 */
export function confirmDeleteLocalPlaylist(id: string, afterDelete?: () => void) {
  useUi.getState().setDialog({ type: 'confirmDelete', playlistId: id, afterDelete });
}

/** 내 재생목록 삭제 실행 (확인 창에서 호출, 실행취소 가능) */
export function deleteLocalPlaylist(id: string, after?: () => void) {
  const removed = useLibrary.getState().deletePlaylist(id);
  if (!removed) return;
  after?.();
  toast(`'${removed.title}' 재생목록을 삭제했습니다`, {
    actionLabel: '실행취소',
    action: () => useLibrary.getState().restorePlaylist(removed),
  });
}

/** 재생목록 메뉴 (링크로 불러온 것 / 내 재생목록 / 좋아요 목록) */
export function collectionMenuItems(
  collection: CollectionInfo,
  getTracks: () => Promise<Track[]>,
  opts: { onDeleted?: () => void } = {},
): MenuState['items'] {
  const source = { title: collection.title, path: collectionPath(collection) };
  const withTracks = (fn: (t: Track[]) => void) => async () => {
    try {
      const tracks = await getTracks();
      if (!tracks.length) return toast('재생할 수 있는 곡이 없습니다');
      fn(tracks);
    } catch (err) {
      toast((err as Error).message);
    }
  };
  const items: MenuState['items'] = [
    { label: '셔플 재생', icon: <MdShuffle />, onSelect: withTracks((t) => player().playTracks(t, 0, source, { shuffle: true, randomStart: true })) },
    { label: '다음 곡으로 재생', icon: <MdPlaylistPlay />, onSelect: withTracks((t) => player().playNext(t)) },
    { label: '현재 재생목록에 추가', icon: <MdQueueMusic />, onSelect: withTracks((t) => player().addToQueue(t)) },
  ];

  if (collection.kind === 'local') {
    items.push(
      'divider',
      {
        label: '이름 바꾸기',
        icon: <MdDriveFileRenameOutline />,
        onSelect: () => useUi.getState().setDialog({ type: 'rename', playlistId: collection.id }),
      },
      { label: '재생목록 삭제', icon: <MdDeleteOutline />, onSelect: () => confirmDeleteLocalPlaylist(collection.id, opts.onDeleted) },
    );
    return items;
  }

  if (collection.kind === 'liked') return items;

  // 링크로 불러온 재생목록/앨범
  const linked = { kind: collection.kind, id: collection.id, title: collection.title, subtitle: collection.subtitle, thumbnail: collection.thumbnail };
  const saved = useLibrary.getState().isSaved(collection.id);
  items.push(
    'divider',
    {
      label: '내 재생목록으로 복사',
      icon: <MdPlaylistAdd />,
      onSelect: withTracks((t) => saveTracksTo(t, collection.title)),
    },
    saved
      ? {
          label: '사이드바에서 삭제',
          icon: <MdDeleteOutline />,
          onSelect: () => {
            useLibrary.getState().remove(collection.id);
            toast('사이드바에서 삭제했습니다', { actionLabel: '실행취소', action: () => useLibrary.getState().register(linked) });
          },
        }
      : {
          label: '사이드바에 등록',
          icon: <MdLibraryAdd />,
          onSelect: () => {
            useLibrary.getState().register(linked);
            toast('사이드바에 등록했습니다');
          },
        },
  );
  return items;
}
