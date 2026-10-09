import { useRef, useState, type MouseEvent } from 'react';
import { MdChevronLeft, MdChevronRight, MdMoreVert, MdPause, MdPlayArrow } from 'react-icons/md';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import type { Card, Section, Track } from '../../shared/types';
import { api, loadAllTracks } from '../lib/api';
import { player, usePlayer } from '../store/player';
import { toast } from '../store/ui';
import { IconButton } from './IconButton';
import { collectionMenuItems, openMenuFromEvent, trackMenuItems } from './menus';
import { Thumb } from './Thumb';
import { TrackRow } from './TrackRow';

export function cardPath(card: Card): string | null {
  switch (card.kind) {
    case 'album':
      return `/browse/${card.id}`;
    case 'playlist':
      return `/playlist?list=${encodeURIComponent(card.id)}`;
    case 'artist':
      return `/channel/${card.id}`;
    default:
      return null;
  }
}

/** 카드가 가리키는 모음(앨범/재생목록/아티스트)의 트랙 목록을 가져온다 */
export async function tracksOfCard(card: Card): Promise<Track[]> {
  switch (card.kind) {
    case 'album':
      return (await api.album(card.id)).tracks;
    case 'playlist': {
      const detail = await api.playlist(card.id);
      return loadAllTracks(detail);
    }
    case 'artist':
      return (await api.artist(card.id)).songs;
    case 'radio':
      return (await api.upNext(undefined, card.playlistId ?? card.id)).tracks;
    default:
      return card.track ? [card.track] : [];
  }
}

export async function playCard(card: Card, opts: { shuffle?: boolean } = {}) {
  if (card.track && (card.kind === 'song' || card.kind === 'video')) {
    return player().startRadio(card.track);
  }
  try {
    const tracks = await tracksOfCard(card);
    if (!tracks.length) return toast('재생할 수 있는 곡이 없습니다');
    player().playTracks(tracks, 0, { title: card.title, path: cardPath(card) ?? undefined }, opts);
  } catch (err) {
    toast((err as Error).message);
  }
}

export function openCard(card: Card, navigate: NavigateFunction) {
  const path = cardPath(card);
  if (path) navigate(path);
  else void playCard(card);
}

function cardMenu(e: MouseEvent, card: Card, navigate: NavigateFunction) {
  if (card.track) return openMenuFromEvent(e, trackMenuItems(card.track, { navigate }));
  const path = cardPath(card) ?? '/';
  openMenuFromEvent(
    e,
    collectionMenuItems({
      collection: {
        kind: card.kind === 'album' ? 'album' : card.kind === 'artist' ? 'artist' : 'playlist',
        id: card.id,
        title: card.title,
        subtitle: card.subtitle,
        thumbnail: card.thumbnail,
      },
      getTracks: () => tracksOfCard(card),
      path,
    }),
  );
}

function useCardPlaying(card: Card) {
  return usePlayer((s) => {
    const cur = s.queue[s.index];
    if (!cur) return false;
    const active = s.status === 'playing' || s.status === 'buffering' || s.status === 'loading';
    if (card.track) return active && cur.track.videoId === card.track.videoId;
    const path = cardPath(card);
    return active && !!path && s.source?.path === path;
  });
}

export function MediaCard({ card }: { card: Card }) {
  const navigate = useNavigate();
  const isVideo = card.kind === 'video';
  const round = card.kind === 'artist';
  const playing = useCardPlaying(card);
  const [busy, setBusy] = useState(false);

  const onPlay = async (e: MouseEvent) => {
    e.stopPropagation();
    if (playing) return player().pause();
    setBusy(true);
    await playCard(card);
    setBusy(false);
  };

  return (
    <div
      className={`media-card ${isVideo ? 'media-card--video' : ''} ${round ? 'media-card--artist' : ''}`}
      onClick={() => openCard(card, navigate)}
      onContextMenu={(e) => cardMenu(e, card, navigate)}
    >
      <div className="media-card__art">
        <Thumb src={card.thumbnail} videoId={card.track?.videoId} size={isVideo ? 320 : 226} round={round} />
        {!round && (
          <div className="media-card__hover">
            <IconButton label="작업 메뉴" size="sm" className="media-card__more" onClick={(e) => cardMenu(e, card, navigate)}>
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
        )}
      </div>
      <div className="media-card__title" title={card.title}>
        {card.title}
      </div>
      {card.subtitle && <div className="media-card__subtitle">{card.subtitle}</div>}
    </div>
  );
}

/** 한 줄짜리 카드 (검색 결과의 앨범/아티스트/재생목록 등) */
export function CardRow({ card }: { card: Card }) {
  const navigate = useNavigate();
  return (
    <div className="card-row" onClick={() => openCard(card, navigate)} onContextMenu={(e) => cardMenu(e, card, navigate)}>
      <Thumb src={card.thumbnail} size={56} round={card.kind === 'artist'} className="card-row__thumb" />
      <div className="card-row__text">
        <div className="card-row__title">{card.title}</div>
        {card.subtitle && <div className="card-row__subtitle">{card.subtitle}</div>}
      </div>
      {card.kind !== 'artist' && (
        <IconButton label="작업 메뉴" size="sm" onClick={(e) => cardMenu(e, card, navigate)}>
          <MdMoreVert />
        </IconButton>
      )}
    </div>
  );
}

export function Carousel({ title, strapline, children, action }: { title: string; strapline?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <section className="carousel">
      <div className="carousel__header">
        <div>
          {strapline && <div className="carousel__strapline">{strapline}</div>}
          <h2 className="carousel__title">{title}</h2>
        </div>
        <div className="carousel__nav">
          {action}
          <IconButton label="이전" className="icon-btn--outline" onClick={() => scroll(-1)}>
            <MdChevronLeft />
          </IconButton>
          <IconButton label="다음" className="icon-btn--outline" onClick={() => scroll(1)}>
            <MdChevronRight />
          </IconButton>
        </div>
      </div>
      <div className="carousel__track" ref={ref}>
        {children}
      </div>
    </section>
  );
}

/** 곡 카드가 많은 섹션은 YouTube Music의 '빠른 선곡'처럼 4줄 그리드로 보여준다 */
function QuickPicks({ section }: { section: Section }) {
  const tracks = section.items.filter((i) => i.track).map((i) => i.track!) as Track[];
  const columns: Track[][] = [];
  for (let i = 0; i < tracks.length; i += 4) columns.push(tracks.slice(i, i + 4));
  return (
    <Carousel title={section.title} strapline={section.strapline}>
      {columns.map((col, ci) => (
        <div className="quick-picks__col" key={ci}>
          {col.map((t) => (
            <TrackRow key={t.videoId} track={t} showAlbum={false} onPlay={() => player().startRadio(t)} />
          ))}
        </div>
      ))}
    </Carousel>
  );
}

export function SectionView({ section }: { section: Section }) {
  if (section.layout === 'list') return <ListSection section={section} />;
  const quickPicks = section.items.length >= 8 && section.items.every((i) => i.kind === 'song' && i.track);
  if (quickPicks) return <QuickPicks section={section} />;
  return (
    <Carousel title={section.title} strapline={section.strapline}>
      {section.items.map((card, i) => (
        <MediaCard key={`${card.kind}-${card.id}-${i}`} card={card} />
      ))}
    </Carousel>
  );
}

export function ListSection({ section, onPlayTrack }: { section: Section; onPlayTrack?: (t: Track, index: number) => void }) {
  const tracks = section.items.filter((c) => c.track).map((c) => c.track!) as Track[];
  return (
    <section className="list-section">
      {section.title && <h2 className="list-section__title">{section.title}</h2>}
      <div className="list-section__items">
        {section.items.map((card, i) =>
          card.track ? (
            <TrackRow
              key={`${card.id}-${i}`}
              track={card.track}
              showAlbum
              onPlay={() =>
                onPlayTrack ? onPlayTrack(card.track!, tracks.indexOf(card.track!)) : player().startRadio(card.track!)
              }
            />
          ) : (
            <CardRow key={`${card.id}-${i}`} card={card} />
          ),
        )}
      </div>
    </section>
  );
}
