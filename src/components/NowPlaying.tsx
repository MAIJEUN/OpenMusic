import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from './dndModifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, type MouseEvent } from 'react';
import { useAsync } from '../hooks/useAsync';
import { MdDragIndicator, MdKeyboardArrowDown, MdMoreVert, MdPause, MdPlayArrow, MdSkipNext, MdSkipPrevious } from 'react-icons/md';
import { Link, useNavigate } from 'react-router-dom';
import type { FeedPage, Lyrics } from '../../shared/types';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import { player, usePlayer, type QueueItem } from '../store/player';
import { useUi, type NowPlayingTab } from '../store/ui';
import { SectionView } from './Cards';
import { Equalizer } from './Equalizer';
import { IconButton } from './IconButton';
import { ArtistLinks } from './Links';
import { openMenuFromEvent, trackMenuItems } from './menus';
import { PlayPauseIcon, ProgressBar, RatingButtons, RepeatButton, ShuffleButton } from './PlayerBar';
import { Thumb } from './Thumb';

const TABS: { id: NowPlayingTab; label: string }[] = [
  { id: 'upnext', label: '다음 트랙' },
  { id: 'lyrics', label: '가사' },
  { id: 'related', label: '관련 항목' },
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
  const navigate = useNavigate();

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
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

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
              <div className="np__toggle" role="tablist">
                <button type="button" className={mode === 'song' ? 'is-active' : ''} onClick={() => setMode('song')}>
                  노래
                </button>
                <button type="button" className={mode === 'video' ? 'is-active' : ''} onClick={() => setMode('video')}>
                  동영상
                </button>
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
                    <div className="np__mobile-artist">
                      <ArtistLinks artists={t.artists} onNavigate={() => setOpen(false)} />
                    </div>
                  </div>
                  <IconButton label="작업 메뉴" onClick={(e) => openMenuFromEvent(e, trackMenuItems(t, { navigate: go }))}>
                    <MdMoreVert />
                  </IconButton>
                </div>
                <div className="np__mobile-rating">
                  <RatingButtons />
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
                {tab === 'upnext' && <UpNextPanel onNavigate={go} />}
                {tab === 'lyrics' && <LyricsPanel videoId={t.videoId} />}
                {tab === 'related' && <RelatedPanel videoId={t.videoId} />}
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

function UpNextPanel({ onNavigate }: { onNavigate: (to: string) => void }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const autoplay = usePlayer((s) => s.autoplay);
  const radioLoading = usePlayer((s) => s.radioLoading);
  const open = useUi((s) => s.nowPlayingOpen);
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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
    if (!e.over || e.active.id === e.over.id) return;
    const from = queue.findIndex((q) => q.uid === e.active.id);
    const to = queue.findIndex((q) => q.uid === e.over!.id);
    player().moveInQueue(from, to);
  };

  const firstAuto = queue.findIndex((q, i) => q.auto && i > index);

  return (
    <div className="upnext" ref={listRef}>
      {source && (
        <div className="upnext__source">
          <span className="upnext__source-label">재생 중인 출처</span>
          {source.path ? (
            <Link className="upnext__source-title link" to={source.path} onClick={(e) => { e.preventDefault(); onNavigate(source.path!); }}>
              {source.title}
            </Link>
          ) : (
            <span className="upnext__source-title">{source.title}</span>
          )}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={queue.map((q) => q.uid)} strategy={verticalListSortingStrategy}>
          {queue.map((q, i) => (
            <div key={q.uid}>
              {i === firstAuto && <AutoplayHeader />}
              <QueueRow item={q} current={i === index} past={i < index} onNavigate={onNavigate} />
            </div>
          ))}
        </SortableContext>
      </DndContext>
      {firstAuto < 0 && <AutoplayHeader />}
      {autoplay && radioLoading && <div className="upnext__loading">비슷한 음악을 찾는 중…</div>}
    </div>
  );
}

function AutoplayHeader() {
  const autoplay = usePlayer((s) => s.autoplay);
  return (
    <div className="autoplay">
      <div>
        <div className="autoplay__title">자동재생</div>
        <div className="autoplay__desc">비슷한 콘텐츠를 계속 재생합니다</div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={autoplay} onChange={(e) => player().setAutoplay(e.target.checked)} aria-label="자동재생" />
        <span className="switch__track" />
      </label>
    </div>
  );
}

function QueueRow({ item, current, past, onNavigate }: { item: QueueItem; current: boolean; past: boolean; onNavigate: (to: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
  const status = usePlayer((s) => (current ? s.status : 'idle'));
  const playing = current && (status === 'playing' || status === 'buffering' || status === 'loading');
  const t = item.track;

  const menu = (e: MouseEvent) => openMenuFromEvent(e, trackMenuItems(t, { navigate: onNavigate, queueUid: item.uid }));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`queue-item ${current ? 'queue-item--current' : ''} ${past ? 'queue-item--past' : ''} ${isDragging ? 'queue-item--dragging' : ''}`}
      onClick={() => player().jumpTo(item.uid)}
      onContextMenu={menu}
      {...attributes}
      role="listitem"
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
        <div className="queue-item__artist">{t.artists.map((a) => a.name).join(', ')}</div>
      </div>
      <div className="queue-item__end">
        <span className="queue-item__duration">{t.duration ? formatTime(t.duration) : ''}</span>
        <span className="queue-item__tools" onClick={(e) => e.stopPropagation()}>
          <IconButton label="작업 메뉴" size="sm" onClick={menu}>
            <MdMoreVert />
          </IconButton>
          <span className="queue-item__handle" {...listeners} aria-label="순서 변경" title="드래그하여 순서 변경">
            <MdDragIndicator />
          </span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ 가사 ------------------------------ */

function LyricsPanel({ videoId }: { videoId: string }) {
  const { loading, data, error } = useAsync<Lyrics | null>(() => api.lyrics(videoId).catch(() => null), [videoId]);
  if (loading) return <div className="panel-spinner"><div className="spinner" /></div>;
  if (error || !data) return <div className="panel-empty">가사를 사용할 수 없습니다</div>;
  return (
    <div className="lyrics">
      <p className="lyrics__text">{data.text}</p>
      {data.source && <p className="lyrics__source">{data.source}</p>}
    </div>
  );
}

/* ------------------------------ 관련 항목 ------------------------------ */

function RelatedPanel({ videoId }: { videoId: string }) {
  const { loading, data } = useAsync<FeedPage>(() => api.related(videoId), [videoId]);
  if (loading) return <div className="panel-spinner"><div className="spinner" /></div>;
  if (!data?.sections.length) return <div className="panel-empty">관련 항목이 없습니다</div>;
  return (
    <div className="related">
      {data.sections.map((s, i) => (
        <SectionView key={`${s.title}-${i}`} section={s} />
      ))}
    </div>
  );
}
