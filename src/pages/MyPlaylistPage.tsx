import { useMemo, type MouseEvent } from 'react';
import { MdMoreVert, MdPause, MdPlayArrow, MdSearch, MdShuffle } from 'react-icons/md';
import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../../shared/types';
import { CollectionArt } from '../components/CollectionArt';
import { IconButton } from '../components/IconButton';
import { collectionMenuItems, openMenuFromEvent } from '../components/menus';
import { Thumb } from '../components/Thumb';
import { TrackList } from '../components/TrackRow';
import { formatTotal } from '../lib/format';
import { collectionPath, likedInfo, likedTracks, localInfo, useLibrary, type CollectionInfo } from '../store/library';
import { player, usePlayer } from '../store/player';
import { toast } from '../store/ui';

/** 이 사이트에서 직접 만든 재생목록 (곡 추가/삭제/순서 변경 가능) */
export function LocalPlaylistPage({ id }: { id: string }) {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const navigate = useNavigate();
  if (!playlist) {
    return (
      <div className="page-state">
        <p>재생목록을 찾을 수 없습니다. 삭제되었거나 다른 브라우저에서 만든 재생목록일 수 있어요.</p>
        <Link to="/" className="btn btn--outline">
          홈으로
        </Link>
      </div>
    );
  }
  return (
    <MyPlaylistView
      info={localInfo(playlist)}
      tracks={playlist.tracks}
      metaLine="내 재생목록"
      empty={
        <div className="my-empty">
          <p>아직 곡이 없어요. 노래를 검색해서 '재생목록에 저장'으로 추가해 보세요.</p>
          <Link to="/search" className="btn btn--outline">
            <MdSearch /> 노래 검색
          </Link>
        </div>
      }
      onMove={(from, to) => useLibrary.getState().movePlaylistTrack(id, from, to)}
      onDeleted={() => navigate('/')}
    />
  );
}

/** 하트를 누른 곡 모음 */
export function LikedPage() {
  const liked = useLibrary((s) => s.liked);
  const tracks = useMemo(() => likedTracks(liked), [liked]);
  return (
    <MyPlaylistView
      info={likedInfo(liked)}
      tracks={tracks}
      metaLine="자동 재생목록"
      empty={
        <div className="my-empty">
          <p>곡 옆의 하트(♡)를 누르면 여기에 모여요.</p>
        </div>
      }
    />
  );
}

interface ViewProps {
  info: CollectionInfo;
  tracks: Track[];
  metaLine: string;
  empty: React.ReactNode;
  onMove?: (from: number, to: number) => void;
  onDeleted?: () => void;
}

function MyPlaylistView({ info, tracks, metaLine, empty, onMove, onDeleted }: ViewProps) {
  const path = collectionPath(info);
  const playingHere = usePlayer((s) => s.source?.path === path && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'));
  const isSourceHere = usePlayer((s) => s.source?.path === path && s.queue.length > 0);
  const source = { title: info.title, path };
  const total = formatTotal(tracks);

  const playAll = (shuffle = false) => {
    if (!tracks.length) return toast('재생할 곡이 없습니다');
    if (!shuffle && isSourceHere) return player().togglePlay();
    player().playTracks(tracks, 0, source, shuffle ? { shuffle: true, randomStart: true } : { randomStart: true });
  };
  const menu = (e: MouseEvent) => openMenuFromEvent(e, collectionMenuItems(info, async () => tracks, { onDeleted }));

  return (
    <div className="collection">
      <div className="collection__backdrop">{info.thumbnail && <Thumb src={info.thumbnail} size={120} />}</div>
      <div className="collection__layout">
        <header className="collection__header">
          <div className="collection__art">
            <CollectionArt info={info} size={264} />
          </div>
          <h1 className="collection__title">{info.title}</h1>
          <div className="collection__meta">{metaLine}</div>
          <div className="collection__meta">{[`${tracks.length}곡`, total].filter(Boolean).join(' • ')}</div>
          <div className="collection__actions">
            <IconButton label="셔플" className="icon-btn--filled" onClick={() => playAll(true)} disabled={!tracks.length}>
              <MdShuffle />
            </IconButton>
            <button type="button" className="play-big" aria-label={playingHere ? '일시중지' : '재생'} onClick={() => playAll(false)} disabled={!tracks.length}>
              {playingHere ? <MdPause /> : <MdPlayArrow />}
            </button>
            <IconButton label="더보기" className="icon-btn--filled" onClick={menu}>
              <MdMoreVert />
            </IconButton>
          </div>
          {onMove && tracks.length > 1 && <p className="collection__hint">곡을 끌어서 순서를 바꿀 수 있어요</p>}
        </header>

        <div className="collection__body">
          {tracks.length ? (
            <TrackList
              tracks={tracks}
              showAlbum
              playlistId={info.kind === 'local' ? info.id : undefined}
              onPlayIndex={(i) => player().playTracks(tracks, i, source)}
              onMove={onMove}
            />
          ) : (
            empty
          )}
        </div>
      </div>
    </div>
  );
}
