import type { MouseEvent } from 'react';
import { MdDeleteOutline, MdLibraryAdd, MdPlaylistPlay, MdQueueMusic, MdRemoveCircleOutline, MdShuffle } from 'react-icons/md';
import type { Track } from '../../shared/types';
import { collectionPath, useLibrary, type CollectionInfo } from '../store/library';
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

/** 곡 메뉴: 다음 곡으로 재생 / 현재 재생목록에 추가 (대기열 항목이면 삭제) */
export function trackMenuItems(track: Track, queueUid?: string): MenuState['items'] {
  const items: MenuState['items'] = [
    { label: '다음 곡으로 재생', icon: <MdPlaylistPlay />, onSelect: () => player().playNext([track]) },
    { label: '현재 재생목록에 추가', icon: <MdQueueMusic />, onSelect: () => player().addToQueue([track]) },
  ];
  if (queueUid) {
    items.push({ label: '현재 재생목록에서 삭제', icon: <MdRemoveCircleOutline />, onSelect: () => player().removeFromQueue(queueUid) });
  }
  return items;
}

/** 재생목록 메뉴: 셔플 / 다음에 재생 / 대기열 추가 / 등록·삭제 */
export function collectionMenuItems(collection: CollectionInfo, getTracks: () => Promise<Track[]>): MenuState['items'] {
  const saved = useLibrary.getState().isSaved(collection.id);
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
  return [
    { label: '셔플 재생', icon: <MdShuffle />, onSelect: withTracks((t) => player().playTracks(t, 0, source, { shuffle: true })) },
    { label: '다음 곡으로 재생', icon: <MdPlaylistPlay />, onSelect: withTracks((t) => player().playNext(t)) },
    { label: '현재 재생목록에 추가', icon: <MdQueueMusic />, onSelect: withTracks((t) => player().addToQueue(t)) },
    'divider',
    saved
      ? {
          label: '사이드바에서 삭제',
          icon: <MdDeleteOutline />,
          onSelect: () => {
            useLibrary.getState().remove(collection.id);
            toast('사이드바에서 삭제했습니다', { actionLabel: '실행취소', action: () => useLibrary.getState().register(collection) });
          },
        }
      : {
          label: '사이드바에 등록',
          icon: <MdLibraryAdd />,
          onSelect: () => {
            useLibrary.getState().register(collection);
            toast('사이드바에 등록했습니다');
          },
        },
  ];
}
