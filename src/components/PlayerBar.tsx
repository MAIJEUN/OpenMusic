import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdPause,
  MdPlayArrow,
  MdRepeat,
  MdRepeatOne,
  MdShuffle,
  MdSkipNext,
  MdSkipPrevious,
  MdVolumeDown,
  MdVolumeOff,
  MdVolumeUp,
} from 'react-icons/md';
import { artistNames, formatTime } from '../lib/format';
import { player, usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { IconButton } from './IconButton';
import { Thumb } from './Thumb';

/** 드래그 가능한 진행 막대 */
export function ProgressBar({ className = '' }: { className?: string }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  const ratioAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const onDown = (e: ReactPointerEvent) => {
    if (!duration) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(ratioAt(e.clientX) * duration);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!duration || !ref.current) return;
    const ratio = ratioAt(e.clientX);
    const r = ref.current.getBoundingClientRect();
    setHover({ x: ratio * r.width, t: ratio * duration });
    if (drag !== null) setDrag(ratio * duration);
  };
  const onUp = (e: ReactPointerEvent) => {
    if (drag === null) return;
    player().seek(ratioAt(e.clientX) * duration);
    setDrag(null);
  };

  const shown = drag ?? position;
  const pct = duration ? Math.min(100, (shown / duration) * 100) : 0;

  return (
    <div
      ref={ref}
      className={`progress ${drag !== null ? 'progress--dragging' : ''} ${className}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => e.stopPropagation()}
      role="slider"
      aria-label="재생 위치"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={formatTime(shown)}
      tabIndex={-1}
    >
      <div className="progress__rail">
        {hover && <div className="progress__hover" style={{ width: hover.x }} />}
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress__knob" style={{ left: `${pct}%` }} />
      {(hover || drag !== null) && duration > 0 && (
        <div className="progress__tip" style={{ left: drag !== null ? `${pct}%` : hover!.x }}>
          {formatTime(drag ?? hover!.t)}
        </div>
      )}
    </div>
  );
}

export function PlayPauseIcon() {
  const status = usePlayer((s) => s.status);
  const playing = status === 'playing' || status === 'buffering' || status === 'loading';
  return playing ? <MdPause /> : <MdPlayArrow />;
}

function useIsPlaying() {
  const status = usePlayer((s) => s.status);
  return status === 'playing' || status === 'buffering' || status === 'loading';
}

function TimeInfo() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  return (
    <span className="player-bar__time">
      {formatTime(position)} / {formatTime(duration)}
    </span>
  );
}

function Volume() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const icon = muted || volume === 0 ? <MdVolumeOff /> : volume < 50 ? <MdVolumeDown /> : <MdVolumeUp />;
  return (
    <div className="volume">
      <input
        type="range"
        className="volume__slider"
        min={0}
        max={100}
        value={muted ? 0 : volume}
        onChange={(e) => player().setVolume(Number(e.target.value))}
        aria-label="볼륨"
        style={{ ['--val' as string]: `${muted ? 0 : volume}%` }}
      />
      <IconButton label={muted ? '음소거 해제' : '음소거'} onClick={() => player().toggleMute()}>
        {icon}
      </IconButton>
    </div>
  );
}

export function RepeatButton({ size }: { size?: 'sm' | 'md' | 'lg' }) {
  const repeat = usePlayer((s) => s.repeat);
  return (
    <IconButton
      label={repeat === 'off' ? '모두 반복' : repeat === 'all' ? '한 곡 반복' : '반복 사용 안함'}
      size={size}
      className="icon-btn--toggle"
      active={repeat !== 'off'}
      onClick={() => player().cycleRepeat()}
    >
      {repeat === 'one' ? <MdRepeatOne /> : <MdRepeat />}
    </IconButton>
  );
}

export function ShuffleButton({ size }: { size?: 'sm' | 'md' | 'lg' }) {
  const shuffle = usePlayer((s) => s.shuffle);
  return (
    <IconButton label={shuffle ? '셔플 사용 안함' : '셔플'} size={size} className="icon-btn--toggle" active={shuffle} onClick={() => player().toggleShuffle()}>
      <MdShuffle />
    </IconButton>
  );
}

export function PlayerBar() {
  const item = usePlayer((s) => s.queue[s.index]);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const npOpen = useUi((s) => s.nowPlayingOpen);
  const setNp = useUi((s) => s.setNowPlaying);
  const playing = useIsPlaying();

  if (!hasQueue || !item) return null;
  const t = item.track;

  return (
    <div className={`player-bar ${npOpen ? 'player-bar--np' : ''}`} onClick={() => setNp(!npOpen)}>
      <ProgressBar className="player-bar__progress" />

      <div className="player-bar__left" onClick={(e) => e.stopPropagation()}>
        <IconButton label="이전 곡" className="player-bar__prev" onClick={() => player().prev()}>
          <MdSkipPrevious />
        </IconButton>
        <IconButton label={playing ? '일시중지' : '재생'} size="lg" className="player-bar__play" onClick={() => player().togglePlay()}>
          <PlayPauseIcon />
        </IconButton>
        <IconButton label="다음 곡" onClick={() => player().next()}>
          <MdSkipNext />
        </IconButton>
        <TimeInfo />
      </div>

      <div className="player-bar__middle">
        <Thumb src={t.thumbnail} videoId={t.videoId} size={40} className="player-bar__thumb" />
        <div className="player-bar__info">
          <div className="player-bar__title" title={t.title}>
            {t.title}
          </div>
          <div className="player-bar__sub">
            {[artistNames(t.artists), t.album?.name ?? t.extra].filter(Boolean).join(' • ')}
          </div>
        </div>
      </div>

      <div className="player-bar__right" onClick={(e) => e.stopPropagation()}>
        <Volume />
        <RepeatButton />
        <ShuffleButton />
        <IconButton label={npOpen ? '플레이어 페이지 닫기' : '플레이어 페이지 열기'} onClick={() => setNp(!npOpen)}>
          {npOpen ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />}
        </IconButton>
      </div>

      {/* 모바일 미니 플레이어 컨트롤 */}
      <div className="player-bar__mobile" onClick={(e) => e.stopPropagation()}>
        <IconButton label={playing ? '일시중지' : '재생'} onClick={() => player().togglePlay()}>
          <PlayPauseIcon />
        </IconButton>
        <IconButton label="다음 곡" onClick={() => player().next()}>
          <MdSkipNext />
        </IconButton>
      </div>
    </div>
  );
}
