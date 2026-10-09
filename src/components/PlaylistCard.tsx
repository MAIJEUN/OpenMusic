import { useState, type MouseEvent } from 'react';
import { MdMoreVert, MdPause, MdPlayArrow } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import type { Track } from '../../shared/types';
import { api, loadAllTracks } from '../lib/api';
import { collectionPath, type CollectionInfo } from '../store/library';
import { player, usePlayer } from '../store/player';
import { toast } from '../store/ui';
import { IconButton } from './IconButton';
import { collectionMenuItems, openMenuFromEvent } from './menus';
import { Thumb } from './Thumb';

/** 등록된 재생목록/앨범의 전체 트랙 */
export async function tracksOf(c: Pick<CollectionInfo, 'kind' | 'id'>): Promise<Track[]> {
  if (c.kind === 'album') return (await api.album(c.id)).tracks;
  return loadAllTracks(await api.playlist(c.id));
}

export function PlaylistCard({ collection }: { collection: CollectionInfo }) {
  const navigate = useNavigate();
  const path = collectionPath(collection);
  const playing = usePlayer((s) => s.source?.path === path && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'));
  const isSource = usePlayer((s) => s.source?.path === path && s.queue.length > 0);
  const [busy, setBusy] = useState(false);

  const onPlay = async (e: MouseEvent) => {
    e.stopPropagation();
    if (isSource) return player().togglePlay();
    setBusy(true);
    try {
      const tracks = await tracksOf(collection);
      if (!tracks.length) toast('재생할 수 있는 곡이 없습니다');
      else player().playTracks(tracks, 0, { title: collection.title, path });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const menu = (e: MouseEvent) => openMenuFromEvent(e, collectionMenuItems(collection, () => tracksOf(collection)));

  return (
    <div className="media-card" onClick={() => navigate(path)} onContextMenu={menu}>
      <div className="media-card__art">
        <Thumb src={collection.thumbnail} size={226} />
        <div className="media-card__hover">
          <IconButton label="작업 메뉴" size="sm" className="media-card__more" onClick={menu}>
            <MdMoreVert />
          </IconButton>
          <button
            type="button"
            className={`play-circle ${playing ? 'play-circle--visible' : ''}`}
            aria-label={playing ? '일시중지' : '재생'}
            onClick={onPlay}
            disabled={busy}
          >
            {playing ? <MdPause /> : <MdPlayArrow />}
          </button>
        </div>
      </div>
      <div className="media-card__title" title={collection.title}>
        {collection.title}
      </div>
      {collection.subtitle && <div className="media-card__subtitle">{collection.subtitle}</div>}
    </div>
  );
}
