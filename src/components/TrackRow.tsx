import { memo, type MouseEvent } from 'react';
import { MdExplicit, MdMoreVert, MdPause, MdPlayArrow } from 'react-icons/md';
import type { Track } from '../../shared/types';
import { artistNames, formatTime } from '../lib/format';
import { player, usePlayer } from '../store/player';
import { Equalizer } from './Equalizer';
import { IconButton } from './IconButton';
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
  const isCurrent = usePlayer((s) => s.queue[s.index]?.track.videoId === track.videoId);
  const isPlaying = usePlayer((s) => isCurrent && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'));

  const handlePlay = (e?: MouseEvent) => {
    e?.stopPropagation();
    if (isCurrent) player().togglePlay();
    else onPlay();
  };

  const openMenu = (e: MouseEvent) => openMenuFromEvent(e, trackMenuItems(track));
  const artists = artistNames(track.artists);
  const albumText = track.album?.name ?? track.extra ?? '';

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
          {[artists, showAlbum ? albumText : ''].filter(Boolean).join(' • ')}
        </div>
      </div>

      <div className="track-row__col track-row__artists" title={artists}>
        {track.explicit && <MdExplicit className="explicit" aria-label="청소년 유해" />}
        {artists}
      </div>

      {showAlbum && (
        <div className="track-row__col track-row__album" title={albumText}>
          {albumText}
        </div>
      )}

      <div className="track-row__actions" onClick={(e) => e.stopPropagation()}>
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
