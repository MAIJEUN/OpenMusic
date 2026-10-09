import { memo, type MouseEvent } from 'react';
import { MdExplicit, MdMoreVert, MdPause, MdPlayArrow, MdThumbUp, MdThumbUpOffAlt } from 'react-icons/md';
import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../../shared/types';
import { formatTime } from '../lib/format';
import { useLibrary } from '../store/library';
import { player, usePlayer } from '../store/player';
import { toast } from '../store/ui';
import { Equalizer } from './Equalizer';
import { IconButton } from './IconButton';
import { ArtistLinks } from './Links';
import { openMenuFromEvent, trackMenuItems } from './menus';
import { Thumb } from './Thumb';

interface Props {
  track: Track;
  /** 앨범처럼 번호를 보여줄 때 */
  number?: number;
  showAlbum?: boolean;
  onPlay: () => void;
}

export const TrackRow = memo(function TrackRow({ track, number, showAlbum = true, onPlay }: Props) {
  const navigate = useNavigate();
  const isCurrent = usePlayer((s) => s.queue[s.index]?.track.videoId === track.videoId);
  const isPlaying = usePlayer((s) => isCurrent && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'));
  const liked = useLibrary((s) => s.liked.some((t) => t.videoId === track.videoId));

  const handlePlay = (e?: MouseEvent) => {
    e?.stopPropagation();
    if (isCurrent) player().togglePlay();
    else onPlay();
  };

  const openMenu = (e: MouseEvent) => openMenuFromEvent(e, trackMenuItems(track, { navigate }));

  return (
    <div
      className={`track-row ${isCurrent ? 'track-row--current' : ''}`}
      onClick={() => handlePlay()}
      onContextMenu={openMenu}
      role="row"
    >
      <div className="track-row__lead">
        {number !== undefined ? (
          <div className="track-row__number">
            {isCurrent ? <Equalizer paused={!isPlaying} /> : <span>{number}</span>}
            <button type="button" className="track-row__num-play" aria-label={isPlaying ? '일시중지' : '재생'} onClick={handlePlay}>
              {isPlaying ? <MdPause /> : <MdPlayArrow />}
            </button>
          </div>
        ) : (
          <div className="track-row__thumb">
            <Thumb src={track.thumbnail} videoId={track.videoId} size={48} />
            <button
              type="button"
              className={`track-row__overlay ${isCurrent ? 'track-row__overlay--visible' : ''}`}
              aria-label={isPlaying ? '일시중지' : '재생'}
              onClick={handlePlay}
            >
              {isCurrent && isPlaying ? (
                <>
                  <span className="track-row__eq"><Equalizer /></span>
                  <span className="track-row__pause"><MdPause /></span>
                </>
              ) : (
                <MdPlayArrow />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="track-row__main">
        <div className="track-row__title" title={track.title}>
          {track.title}
        </div>
        <div className="track-row__sub">
          {track.explicit && <MdExplicit className="explicit" aria-label="청소년 유해" />}
          <ArtistLinks artists={track.artists} />
          {(showAlbum && track.album) || track.extra ? (
            <span className="track-row__mobile-extra">
              {' • '}
              {track.album?.name ?? track.extra}
            </span>
          ) : null}
        </div>
      </div>

      <div className="track-row__col track-row__artists">
        {track.explicit && <MdExplicit className="explicit" aria-label="청소년 유해" />}
        <ArtistLinks artists={track.artists} />
      </div>

      {showAlbum && (
        <div className="track-row__col track-row__album">
          {track.album?.id ? (
            <Link to={`/browse/${track.album.id}`} className="link" onClick={(e) => e.stopPropagation()}>
              {track.album.name}
            </Link>
          ) : (
            <span>{track.album?.name ?? track.extra ?? ''}</span>
          )}
        </div>
      )}

      <div className="track-row__actions" onClick={(e) => e.stopPropagation()}>
        <IconButton
          label={liked ? '좋아요 취소' : '좋아요'}
          size="sm"
          className={`track-row__like ${liked ? 'track-row__like--on' : ''}`}
          onClick={() => {
            const now = useLibrary.getState().toggleLike(track);
            toast(now ? '좋아요 표시한 음악에 추가됨' : '좋아요 표시한 음악에서 삭제됨');
          }}
        >
          {liked ? <MdThumbUp /> : <MdThumbUpOffAlt />}
        </IconButton>
        <IconButton label="작업 메뉴" size="sm" onClick={openMenu}>
          <MdMoreVert />
        </IconButton>
      </div>

      <div className="track-row__duration">{track.duration ? formatTime(track.duration) : ''}</div>
    </div>
  );
});

interface ListProps {
  tracks: Track[];
  numbered?: boolean;
  showAlbum?: boolean;
  onPlayIndex: (index: number) => void;
}

export function TrackList({ tracks, numbered, showAlbum, onPlayIndex }: ListProps) {
  return (
    <div className="track-list" role="table">
      {tracks.map((t, i) => (
        <TrackRow
          key={`${t.videoId}-${i}`}
          track={t}
          number={numbered ? i + 1 : undefined}
          showAlbum={showAlbum}
          onPlay={() => onPlayIndex(i)}
        />
      ))}
    </div>
  );
}
