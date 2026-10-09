import type { MouseEvent } from 'react';
import {
  MdAlbum,
  MdDeleteOutline,
  MdLibraryAdd,
  MdLibraryAddCheck,
  MdOutlineSensors,
  MdPerson,
  MdPlaylistPlay,
  MdQueueMusic,
  MdRemoveCircleOutline,
  MdShare,
  MdShuffle,
  MdThumbUp,
  MdThumbUpOffAlt,
} from 'react-icons/md';
import type { Track } from '../../shared/types';
import { shareUrl } from '../lib/format';
import { useLibrary, type SavedCollection } from '../store/library';
import { player } from '../store/player';
import { toast, useUi, type MenuItem, type MenuState } from '../store/ui';

export function openMenuFromEvent(e: MouseEvent, items: MenuState['items'], header?: MenuState['header']) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  if (e.type === 'contextmenu') {
    useUi.getState().openMenu({ x: e.clientX, y: e.clientY, items, header });
  } else {
    const r = target.getBoundingClientRect();
    useUi.getState().openMenu({
      x: r.left,
      y: r.bottom,
      anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      items,
      header,
    });
  }
}

export async function copyLink(path: string) {
  const url = shareUrl(path);
  try {
    await navigator.clipboard.writeText(url);
    toast('링크가 클립보드에 복사되었습니다');
  } catch {
    window.prompt('링크를 복사하세요', url);
  }
}

interface TrackMenuOptions {
  navigate: (to: string) => void;
  queueUid?: string;
}

export function trackMenuItems(track: Track, { navigate, queueUid }: TrackMenuOptions): MenuState['items'] {
  const lib = useLibrary.getState();
  const liked = lib.isLiked(track.videoId);
  const artist = track.artists.find((a) => a.id);
  const items: (MenuItem | 'divider')[] = [
    { label: '뮤직 스테이션 시작', icon: <MdOutlineSensors />, onSelect: () => player().startRadio(track) },
    { label: '다음 곡으로 재생', icon: <MdPlaylistPlay />, onSelect: () => player().playNext([track]) },
    { label: '현재 재생목록에 추가', icon: <MdQueueMusic />, onSelect: () => player().addToQueue([track]) },
  ];
  if (queueUid) {
    items.push({ label: '현재 재생목록에서 삭제', icon: <MdRemoveCircleOutline />, onSelect: () => player().removeFromQueue(queueUid) });
  }
  items.push('divider', {
    label: liked ? '좋아요 표시한 음악에서 삭제' : '좋아요 표시한 음악에 추가',
    icon: liked ? <MdThumbUp /> : <MdThumbUpOffAlt />,
    onSelect: () => {
      const now = useLibrary.getState().toggleLike(track);
      toast(now ? '좋아요 표시한 음악에 추가됨' : '좋아요 표시한 음악에서 삭제됨');
    },
  });
  if (track.album?.id) {
    const id = track.album.id;
    items.push({ label: '앨범으로 이동', icon: <MdAlbum />, onSelect: () => navigate(`/browse/${id}`) });
  }
  if (artist?.id) {
    const id = artist.id;
    items.push({ label: '아티스트로 이동', icon: <MdPerson />, onSelect: () => navigate(`/channel/${id}`) });
  }
  items.push({ label: '공유', icon: <MdShare />, onSelect: () => copyLink(`/watch?v=${track.videoId}`) });
  return items;
}

interface CollectionMenuOptions {
  collection: Omit<SavedCollection, 'addedAt'>;
  getTracks: () => Promise<Track[]>;
  path: string;
}

export function collectionMenuItems({ collection, getTracks, path }: CollectionMenuOptions): MenuState['items'] {
  const saved = useLibrary.getState().isSaved(collection.id);
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
    {
      label: '셔플 재생',
      icon: <MdShuffle />,
      onSelect: withTracks((t) => player().playTracks(t, 0, { title: collection.title, path }, { shuffle: true })),
    },
    { label: '다음 곡으로 재생', icon: <MdPlaylistPlay />, onSelect: withTracks((t) => player().playNext(t)) },
    { label: '현재 재생목록에 추가', icon: <MdQueueMusic />, onSelect: withTracks((t) => player().addToQueue(t)) },
    'divider',
  ];
  if (collection.kind !== 'artist' || saved) {
    items.push({
      label: saved ? '보관함에서 삭제' : '보관함에 저장',
      icon: saved ? <MdLibraryAddCheck /> : <MdLibraryAdd />,
      onSelect: () => {
        const now = useLibrary.getState().toggleSaved(collection);
        toast(now ? '보관함에 저장됨' : '보관함에서 삭제됨');
      },
    });
  }
  items.push({ label: '공유', icon: <MdShare />, onSelect: () => copyLink(path) });
  return items;
}

export const removeIcon = <MdDeleteOutline />;
