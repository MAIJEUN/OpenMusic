import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from './dndModifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { useAsync } from '../hooks/useAsync';
import { MdCheck, MdClosedCaption, MdClosedCaptionDisabled, MdClosedCaptionOff, MdDragIndicator, MdKeyboardArrowDown, MdMoreVert, MdPause, MdPlayArrow, MdPlaylistAdd, MdSkipNext, MdSkipPrevious } from 'react-icons/md';
import { Link } from 'react-router-dom';
import type { CaptionLine, Captions, Lyrics } from '../../shared/types';
import { api } from '../lib/api';
import { artistNames, formatTime } from '../lib/format';
import { currentEngine, player, usePlayer, type QueueItem } from '../store/player';
import { useUi, type MenuState, type NowPlayingTab } from '../store/ui';
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
                {mode === 'video' && <VideoCaptionsButton />}
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
                {tab === 'lyrics' && <LyricsPanel videoId={t.videoId} />}
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

/** 동영상 위 YouTube 자막: 꺼져 있으면 켜고, 켜져 있으면 자막 고르기 메뉴 */
function VideoCaptionsButton() {
  const on = useUi((s) => s.playback.videoCaptions);
  const setPlayback = useUi((s) => s.setPlayback);
  const onClick = (e: MouseEvent) => {
    if (!on) return setPlayback({ videoCaptions: true });
    const { tracks, current } = currentEngine()?.getCaptionTracks?.() ?? { tracks: [] };
    const items: MenuState['items'] = tracks.map((t) => ({
      label: t.name,
      icon: t.id === current ? <MdCheck /> : <span />,
      onSelect: () => setPlayback({ videoCaptionTrack: t.id }),
    }));
    if (!items.length) items.push({ label: '자막 목록을 불러오는 중이에요', icon: <span />, onSelect: () => {} });
    items.push('divider', { label: '자막 끄기', icon: <MdClosedCaptionOff />, onSelect: () => setPlayback({ videoCaptions: false }) });
    openMenuFromEvent(e, items);
  };
  return (
    <IconButton
      label={on ? '동영상 자막 선택' : '동영상 자막 켜기'}
      className="icon-btn--toggle np__cc"
      active={on}
      onClick={onClick}
    >
      {on ? <MdClosedCaption /> : <MdClosedCaptionDisabled />}
    </IconButton>
  );
}

/* ------------------------------ 가사 ------------------------------ */

/** 기본 자막을 받은 뒤, 사용자가 고른 언어가 있으면 그 언어로 다시 받는다 */
async function loadCaptions(videoId: string, lang?: string): Promise<Captions | null> {
  const first = await api.captions(videoId).catch(() => null);
  if (!first || !lang || first.lang === lang || !first.tracks.some((t) => t.code === lang)) return first;
  return (await api.captions(videoId, lang).catch(() => null)) ?? first;
}

function LyricsPanel({ videoId }: { videoId: string }) {
  const pref = useUi((s) => s.lyricsPref);
  const setPref = useUi((s) => s.setLyricsPref);
  const lyrics = useAsync<Lyrics | null>(() => api.lyrics(videoId).catch(() => null), [videoId]);
  const caps = useAsync<Captions | null>(() => loadCaptions(videoId, pref.lang), [videoId, pref.lang]);

  const hasLyrics = !!lyrics.data;
  const hasCaps = !!caps.data?.lines.length;
  const wantCaps = pref.source === 'captions';
  // 원하는 쪽이 준비되면 바로 보여주고, 없으면 다른 쪽이 올 때까지 기다린다
  const view: 'lyrics' | 'captions' | null = wantCaps
    ? hasCaps ? 'captions' : !caps.loading && hasLyrics ? 'lyrics' : null
    : hasLyrics ? 'lyrics' : !lyrics.loading && hasCaps ? 'captions' : null;
  const loading = !view && (lyrics.loading || caps.loading);

  if (loading) return <div className="panel-spinner"><div className="spinner" /></div>;
  if (!view) return <div className="panel-empty">가사와 자막을 사용할 수 없습니다</div>;

  return (
    <div className="lyrics">
      {(hasLyrics && hasCaps) || view === 'captions' ? (
        <div className="lyrics__bar">
          {hasLyrics && hasCaps && (
            <div className="lyrics__switch" role="tablist">
              <button type="button" className={view === 'lyrics' ? 'is-active' : ''} onClick={() => setPref({ source: 'lyrics' })}>
                가사
              </button>
              <button type="button" className={view === 'captions' ? 'is-active' : ''} onClick={() => setPref({ source: 'captions' })}>
                YouTube 자막
              </button>
            </div>
          )}
          {view === 'captions' && caps.data && caps.data.tracks.length > 1 && (
            <select
              className="lyrics__lang"
              value={caps.data.lang}
              onChange={(e) => setPref({ lang: e.target.value, source: 'captions' })}
              aria-label="자막 언어"
            >
              {caps.data.tracks.map((tr) => (
                <option key={tr.code} value={tr.code}>
                  {tr.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : null}

      {view === 'lyrics' && lyrics.data ? (
        <>
          <p className="lyrics__text">{lyrics.data.text}</p>
          {lyrics.data.source && <p className="lyrics__source">{lyrics.data.source}</p>}
        </>
      ) : caps.data ? (
        <>
          <SyncedLines key={`${videoId}:${caps.data.lang}`} lines={caps.data.lines} />
          <p className="lyrics__source">
            YouTube 자막 · {caps.data.tracks.find((t) => t.code === caps.data!.lang)?.name ?? caps.data.lang}
            {caps.data.tracks.find((t) => t.code === caps.data!.lang)?.auto ? ' · 자동 생성 자막은 정확하지 않을 수 있어요' : ''}
          </p>
        </>
      ) : null}
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

/** 재생 위치에 맞춰 현재 줄을 강조하고 가운데로 스크롤하는 자막 가사 */
function SyncedLines({ lines }: { lines: CaptionLine[] }) {
  const position = usePlayer((s) => s.position);
  const ref = useRef<HTMLDivElement>(null);
  const userScrollAt = useRef(0);
  const starts = useMemo(() => lines.map((l) => l.start), [lines]);

  // 지금 줄: 시작 시간이 지난 마지막 줄 (살짝 앞당겨서 말하기 전에 강조)
  let active = -1;
  for (let i = 0; i < starts.length && starts[i] <= position + 0.2; i++) active = i;

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
            player().seek(l.start);
          }}
        >
          {l.text}
        </p>
      ))}
    </div>
  );
}
