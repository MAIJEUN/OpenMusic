import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from './dndModifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useAsync } from '../hooks/useAsync';
import { MdDragIndicator, MdKeyboardArrowDown, MdMoreVert, MdPause, MdPlayArrow, MdPlaylistAdd, MdSkipNext, MdSkipPrevious } from 'react-icons/md';
import { Link } from 'react-router-dom';
import type { Counterpart, LyricLine, Lyrics, Track } from '../../shared/types';
import { api } from '../lib/api';
import { skipSegments } from '../lib/sponsorblock';
import { fetchCounterpart, mapTime } from '../player/useAudioVersion';
import { artistNames, formatTime } from '../lib/format';
import { player, usePlayer, type QueueItem } from '../store/player';
import { useUi, type NowPlayingTab } from '../store/ui';
import { Equalizer } from './Equalizer';
import { IconButton } from './IconButton';
import { openMenuFromEvent, saveTracksTo, trackMenuItems } from './menus';
import { CurrentHeart, PlayPauseIcon, ProgressBar, RepeatButton, ShuffleButton } from './PlayerBar';
import { Thumb } from './Thumb';

const TABS: { id: NowPlayingTab; label: string }[] = [
  { id: 'upnext', label: '다음 트랙' },
  { id: 'lyrics', label: '가사' },
];

export function NowPlaying() {
  const open = useUi((s) => s.nowPlayingOpen);
  const setOpen = useUi((s) => s.setNowPlaying);
  const tab = useUi((s) => s.npTab);
  const setTab = useUi((s) => s.setNpTab);
  const mode = useUi((s) => s.npMode);
  const setMode = useUi((s) => s.setNpMode);
  const setVideoSlot = useUi((s) => s.setVideoSlot);
  const item = usePlayer((s) => s.queue[s.index]);

  // 큐가 비면 닫기
  useEffect(() => {
    if (!item && open) setOpen(false);
  }, [item, open, setOpen]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useUi.getState().menu && !useUi.getState().dialog) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const t = item?.track;

  return (
    <div className={`np ${open ? 'np--open' : ''}`} aria-hidden={!open}>
      {t && (
        <>
          <div className="np__bg">
            <Thumb src={t.thumbnail} videoId={t.videoId} size={120} />
          </div>
          <div className="np__layout">
            <div className="np__main">
              <div className="np__mobile-head">
                <IconButton label="닫기" onClick={() => setOpen(false)}>
                  <MdKeyboardArrowDown />
                </IconButton>
              </div>
              <div className="np__mode">
                <div className="np__toggle" role="tablist">
                  <button type="button" className={mode === 'song' ? 'is-active' : ''} onClick={() => setMode('song')}>
                    노래
                  </button>
                  <button type="button" className={mode === 'video' ? 'is-active' : ''} onClick={() => setMode('video')}>
                    동영상
                  </button>
                </div>
              </div>
              <div className={`np__art ${mode === 'video' ? 'np__art--video' : ''}`}>
                {mode === 'video' ? (
                  <div className="np__video-slot" ref={setVideoSlot} />
                ) : (
                  <Thumb src={t.thumbnail} videoId={t.videoId} size={720} className="np__cover" />
                )}
              </div>

              {/* 모바일용 정보 + 컨트롤 */}
              <div className="np__mobile-info">
                <div className="np__mobile-title-row">
                  <div className="np__mobile-text">
                    <div className="np__mobile-title">{t.title}</div>
                    <div className="np__mobile-artist">{artistNames(t.artists)}</div>
                  </div>
                  <CurrentHeart />
                </div>
                <ProgressBar className="np__mobile-progress" />
                <MobileTimes />
                <div className="np__mobile-controls">
                  <ShuffleButton />
                  <IconButton label="이전 곡" size="lg" onClick={() => player().prev()}>
                    <MdSkipPrevious />
                  </IconButton>
                  <button type="button" className="np__big-play" aria-label="재생/일시중지" onClick={() => player().togglePlay()}>
                    <PlayPauseIcon />
                  </button>
                  <IconButton label="다음 곡" size="lg" onClick={() => player().next()}>
                    <MdSkipNext />
                  </IconButton>
                  <RepeatButton />
                </div>
              </div>
            </div>

            <div className="np__side">
              <div className="np__tabs" role="tablist">
                {TABS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === x.id}
                    className={`np__tab ${tab === x.id ? 'np__tab--active' : ''}`}
                    onClick={() => setTab(x.id)}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              <div className="np__panel">
                {tab === 'upnext' && <UpNextPanel onNavigate={() => setOpen(false)} />}
                {tab === 'lyrics' && <LyricsPanel key={t.videoId} track={t} />}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MobileTimes() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  return (
    <div className="np__mobile-times">
      <span>{formatTime(position)}</span>
      <span>{formatTime(duration)}</span>
    </div>
  );
}

/* ------------------------------ 다음 트랙 ------------------------------ */

function UpNextPanel({ onNavigate }: { onNavigate: () => void }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const open = useUi((s) => s.nowPlayingOpen);
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    // 마우스: 6px 이상 움직이면 끌기 시작 (그냥 클릭은 재생)
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // 터치: 길게 누르면 끌기 시작 (그냥 쓸어 넘기면 스크롤)
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  // 현재 곡이 보이도록 스크롤
  useEffect(() => {
    if (!open) return;
    // 패널 자체가 스크롤 영역일 때만 패널 안에서 스크롤한다 (모바일에서 페이지 전체가 밀리지 않도록)
    const panel = listRef.current?.closest('.np__panel') as HTMLElement | null;
    const el = listRef.current?.querySelector('.queue-item--current') as HTMLElement | null;
    if (!panel || !el || getComputedStyle(panel).overflowY !== 'auto') return;
    const top = el.offsetTop - panel.offsetTop;
    if (top < panel.scrollTop || top + el.offsetHeight > panel.scrollTop + panel.clientHeight) {
      panel.scrollTo({ top: top - 120, behavior: 'smooth' });
    }
  }, [index, open]);

  const onDragEnd = (e: DragEndEvent) => {
    drag.active = false;
    drag.endedAt = Date.now();
    if (!e.over || e.active.id === e.over.id) return;
    const from = queue.findIndex((q) => q.uid === e.active.id);
    const to = queue.findIndex((q) => q.uid === e.over!.id);
    player().moveInQueue(from, to);
  };

  return (
    <div className="upnext" ref={listRef}>
      <div className="upnext__head">
        <div className="upnext__source">
          {source && (
            <>
              <span className="upnext__source-label">재생 중인 출처</span>
              {source.path ? (
                <Link className="upnext__source-title link" to={source.path} onClick={onNavigate}>
                  {source.title}
                </Link>
              ) : (
                <span className="upnext__source-title">{source.title}</span>
              )}
            </>
          )}
        </div>
        {/* 현재 재생목록(대기열)을 내 재생목록으로 저장 */}
        <button
          type="button"
          className="btn btn--outline btn--sm upnext__save"
          disabled={!queue.length}
          onClick={() => saveTracksTo(queue.map((q) => q.track), source?.title)}
        >
          <MdPlaylistAdd /> 저장
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => (drag.active = true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          drag.active = false;
          drag.endedAt = Date.now();
        }}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={queue.map((q) => q.uid)} strategy={verticalListSortingStrategy}>
          {queue.map((q, i) => (
            <QueueRow key={q.uid} item={q} current={i === index} past={i < index} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

/** 끌기 상태: 끌어서 놓은 직후의 클릭(=곡 재생)과 길게 누를 때의 메뉴를 막는 데 쓴다 */
const drag = { active: false, endedAt: 0 };
const justDragged = () => drag.active || Date.now() - drag.endedAt < 250;

function QueueRow({ item, current, past }: { item: QueueItem; current: boolean; past: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
  const status = usePlayer((s) => (current ? s.status : 'idle'));
  const playing = current && (status === 'playing' || status === 'buffering' || status === 'loading');
  const t = item.track;

  const menu = (e: MouseEvent) => {
    if (justDragged()) {
      e.preventDefault();
      return;
    }
    openMenuFromEvent(e, trackMenuItems(t, { queueUid: item.uid }));
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`queue-item ${current ? 'queue-item--current' : ''} ${past ? 'queue-item--past' : ''} ${isDragging ? 'queue-item--dragging' : ''}`}
      onClick={() => !justDragged() && player().jumpTo(item.uid)}
      onContextMenu={menu}
      {...attributes}
      {...listeners}
      role="listitem"
      title="클릭해서 재생 · 끌어서 순서 변경"
    >
      <div className="queue-item__thumb">
        <Thumb src={t.thumbnail} videoId={t.videoId} size={32} />
        <div className={`queue-item__overlay ${current ? 'queue-item__overlay--visible' : ''}`}>
          {current && playing ? (
            <>
              <span className="queue-item__eq"><Equalizer /></span>
              <span className="queue-item__pause"><MdPause /></span>
            </>
          ) : (
            <MdPlayArrow />
          )}
        </div>
      </div>
      <div className="queue-item__text">
        <div className="queue-item__title">{t.title}</div>
        <div className="queue-item__artist">{artistNames(t.artists)}</div>
      </div>
      <div className="queue-item__end">
        <span className="queue-item__duration">{t.duration ? formatTime(t.duration) : ''}</span>
        <span className="queue-item__tools" onClick={(e) => e.stopPropagation()}>
          <IconButton label="작업 메뉴" size="sm" onClick={menu}>
            <MdMoreVert />
          </IconButton>
        </span>
        {/* 줄 어디를 잡아도 끌 수 있지만, 끌 수 있다는 표시로 손잡이를 항상 보여준다 */}
        <span className="queue-item__handle" aria-hidden>
          <MdDragIndicator />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ 가사 ------------------------------ */

function LyricsPanel({ track }: { track: Track }) {
  const playingId = usePlayer((s) => s.playingId) ?? track.videoId;
  const playDuration = usePlayer((s) => s.duration);
  // 노래 ↔ 뮤직비디오 짝: 가사는 노래(음원) 시간 기준이라 뮤직비디오를 틀 때는 시간을 옮겨야 한다
  const cpState = useAsync<Counterpart | null>(() => fetchCounterpart(track.videoId), [track.videoId]);
  const cp = cpState.data ?? null;
  const song =
    cp?.self === 'song' || (!cp && !track.isVideo)
      ? { videoId: track.videoId, duration: track.duration }
      : cp?.other.kind === 'song'
        ? { videoId: cp.other.videoId, duration: cp.other.duration }
        : null;

  const { loading, data } = useAsync<Lyrics | null>(
    () =>
      cpState.loading
        ? new Promise<Lyrics | null>(() => {})
        : api
            .lyrics(song?.videoId ?? playingId, {
              title: track.title,
              artist: artistNames(track.artists),
              album: track.album?.name,
              duration: Math.round(song?.duration || playDuration || track.duration || 0) || undefined,
            })
            .catch(() => null),
    [track.videoId, cpState.loading],
  );
  const [mode, setMode] = useState<'synced' | 'plain'>('synced');

  // 자동 싱크: 지금 재생 중인 영상의 시간으로 가사 시간을 옮긴다
  const sponsor = useAsync(() => skipSegments(playingId), [playingId]);
  const auto = useMemo(() => {
    const lines = data?.synced;
    if (!lines?.length) return null;
    // 1) 노래를 틀고 있으면 그대로
    if (song && playingId === song.videoId) return { lines, how: '' };
    // 2) YouTube Music의 노래 ↔ 뮤직비디오 시간 대응표
    if (cp && song && cp.segments.length) {
      const fromSelf = song.videoId === track.videoId;
      const shift = (t: number) => mapTime(cp, t, fromSelf);
      return { lines: lines.map((l) => ({ ...l, start: shift(l.start), end: shift(l.end) })), how: 'YouTube Music 시간 대응' };
    }
    // 3) 뮤직비디오 앞부분의 '노래가 아닌 구간'(SponsorBlock) 길이만큼 미룬다
    const intro = sponsor.data?.find((g) => g.start < 2 && g.category === 'music_offtopic');
    if (intro) return { lines: lines.map((l) => ({ ...l, start: l.start + intro.end, end: l.end + intro.end })), how: '인트로 길이' };
    return { lines, how: '' };
  }, [data, song?.videoId, playingId, cp, sponsor.data, track.videoId]);

  // 직접 맞춘 싱크는 영상별로 저장해서 다시 들어와도 유지
  const offset = useUi((s) => s.lyricsOffsets[playingId] ?? 0);
  const setOffset = (v: number) => useUi.getState().setLyricsOffset(playingId, Math.round(v * 10) / 10);

  if (loading || cpState.loading) return <div className="panel-spinner"><div className="spinner" /></div>;
  if (!data) return <div className="panel-empty">가사를 사용할 수 없습니다</div>;
  const synced = !!auto && mode === 'synced';

  return (
    <div className="lyrics">
      {auto ? (
        <div className="lyrics__bar">
          <div className="lyrics__switch" role="tablist">
            <button type="button" className={mode === 'synced' ? 'is-active' : ''} onClick={() => setMode('synced')}>
              실시간 가사
            </button>
            <button type="button" className={mode === 'plain' ? 'is-active' : ''} onClick={() => setMode('plain')}>
              전체 가사
            </button>
          </div>
          {synced && (
            <div
              className="lyrics__offset"
              title={`가사가 노래보다 빠르거나 느리면 조절하세요${auto.how ? ` (자동 싱크: ${auto.how})` : ''}`}
            >
              <button type="button" aria-label="가사 0.5초 빠르게" onClick={() => setOffset(offset - 0.5)}>
                −
              </button>
              <button type="button" className="lyrics__offset-value" aria-label="싱크 초기화" onClick={() => setOffset(0)}>
                {offset !== 0 ? `${offset > 0 ? '+' : ''}${offset.toFixed(1)}초` : auto.how ? '자동' : '싱크'}
              </button>
              <button type="button" aria-label="가사 0.5초 느리게" onClick={() => setOffset(offset + 0.5)}>
                +
              </button>
            </div>
          )}
        </div>
      ) : null}

      {synced ? (
        <SyncedLines key={playingId} lines={auto!.lines} offset={offset} />
      ) : (
        <p className="lyrics__text">{data.text}</p>
      )}
      {data.source && <p className="lyrics__source">{data.source}</p>}
    </div>
  );
}

/** 가장 가까운 스크롤 가능한 부모 */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** 재생 위치에 맞춰 현재 줄을 강조하고 가운데로 스크롤하는 실시간 가사 */
function SyncedLines({ lines, offset = 0 }: { lines: LyricLine[]; offset?: number }) {
  const position = usePlayer((s) => s.position);
  const ref = useRef<HTMLDivElement>(null);
  const userScrollAt = useRef(0);
  const starts = useMemo(() => lines.map((l) => l.start), [lines]);

  // 지금 줄: 시작 시간이 지난 마지막 줄 (살짝 앞당겨서 말하기 전에 강조)
  let active = -1;
  for (let i = 0; i < starts.length && starts[i] + offset <= position + 0.2; i++) active = i;

  // 사용자가 직접 스크롤하면 4초 동안은 자동 스크롤을 멈춘다
  useEffect(() => {
    const parent = scrollParent(ref.current);
    if (!parent) return;
    const mark = () => (userScrollAt.current = performance.now());
    const opts = { passive: true } as const;
    parent.addEventListener('wheel', mark, opts);
    parent.addEventListener('touchmove', mark, opts);
    return () => {
      parent.removeEventListener('wheel', mark);
      parent.removeEventListener('touchmove', mark);
    };
  }, []);

  useEffect(() => {
    if (active < 0 || performance.now() - userScrollAt.current < 4000) return;
    const line = ref.current?.children[active] as HTMLElement | undefined;
    const parent = scrollParent(ref.current);
    if (!line || !parent) return;
    const pr = parent.getBoundingClientRect();
    const lr = line.getBoundingClientRect();
    const top = parent.scrollTop + (lr.top - pr.top) - parent.clientHeight / 2 + lr.height / 2;
    parent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [active]);

  return (
    <div ref={ref} className="synced">
      {lines.map((l, i) => (
        <p
          key={i}
          className={`synced__line ${i === active ? 'synced__line--active' : i < active ? 'synced__line--past' : ''}`}
          onClick={() => {
            userScrollAt.current = 0;
            player().seek(Math.max(0, l.start + offset));
          }}
        >
          {l.text}
        </p>
      ))}
    </div>
  );
}
