import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MdLibraryAdd, MdLibraryAddCheck, MdMoreVert, MdPause, MdPlayArrow, MdShuffle, MdThumbUp } from 'react-icons/md';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { CollectionDetail, Track } from '../../shared/types';
import { isMixList } from '../../shared/links';
import { SectionView } from '../components/Cards';
import { IconButton } from '../components/IconButton';
import { collectionMenuItems, openMenuFromEvent } from '../components/menus';
import { ErrorView, Loading } from '../components/PageState';
import { Thumb } from '../components/Thumb';
import { TrackList } from '../components/TrackRow';
import { useAsync } from '../hooks/useAsync';
import { api, loadAllTracks } from '../lib/api';
import { formatTotal } from '../lib/format';
import { useLibrary } from '../store/library';
import { player, usePlayer } from '../store/player';
import { toast } from '../store/ui';

export function PlaylistRoute() {
  const [params] = useSearchParams();
  const id = params.get('list');
  if (!id) return <Navigate to="/" replace />;
  if (id === 'LM') return <LikedPage />;
  return <RemoteCollection key={id} kind={isMixList(id) ? 'radio' : 'playlist'} id={id} />;
}

export function BrowseRoute() {
  const { id = '' } = useParams();
  if (id.startsWith('VL')) return <Navigate to={`/playlist?list=${encodeURIComponent(id.slice(2))}`} replace />;
  if (id.startsWith('UC')) return <Navigate to={`/channel/${id}`} replace />;
  return <RemoteCollection key={id} kind="album" id={id} />;
}

async function fetchCollection(kind: 'playlist' | 'album' | 'radio', id: string): Promise<CollectionDetail> {
  if (kind === 'album') return api.album(id);
  if (kind === 'playlist') return api.playlist(id);
  const res = await api.upNext(undefined, id);
  return {
    kind: 'radio',
    id,
    title: res.title || '믹스',
    subtitle: '믹스',
    thumbnail: res.tracks[0]?.thumbnail,
    tracks: res.tracks,
  };
}

function RemoteCollection({ kind, id }: { kind: 'playlist' | 'album' | 'radio'; id: string }) {
  const { loading, data, error, reload } = useAsync(() => fetchCollection(kind, id), [kind, id]);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [complete, setComplete] = useState(false);
  const fullRef = useRef<Promise<Track[]> | null>(null);

  // 이어받기 토큰이 있으면 나머지 트랙을 백그라운드로 불러온다
  useEffect(() => {
    if (!data) return;
    setTracks(data.tracks);
    setComplete(!data.continuation);
    if (!data.continuation) {
      fullRef.current = Promise.resolve(data.tracks);
      return;
    }
    let alive = true;
    fullRef.current = loadAllTracks(data, (t) => alive && setTracks(t))
      .then((all) => {
        if (alive) setComplete(true);
        return all;
      })
      .catch((err) => {
        toast(`일부 곡을 불러오지 못했습니다. ${(err as Error).message}`);
        if (alive) setComplete(true);
        return data.tracks;
      });
    return () => {
      alive = false;
    };
  }, [data]);

  // 최근 활동 기록
  useEffect(() => {
    if (!data || data.kind === 'radio') return;
    useLibrary.getState().touchRecent({
      kind: data.kind,
      id: data.id,
      title: data.title,
      subtitle: [data.kind === 'album' ? '앨범' : '재생목록', data.author?.name].filter(Boolean).join(' • '),
      thumbnail: data.thumbnail,
    });
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error} onRetry={reload} />;

  const path = data.kind === 'album' ? `/browse/${data.id}` : `/playlist?list=${encodeURIComponent(data.id)}`;
  return (
    <CollectionView
      detail={data}
      tracks={tracks ?? data.tracks}
      complete={complete}
      getAllTracks={() => fullRef.current ?? Promise.resolve(tracks ?? data.tracks)}
      path={path}
      savable={data.kind !== 'radio'}
    />
  );
}

function LikedPage() {
  const liked = useLibrary((s) => s.liked);
  const tracks = useMemo(() => liked.map(({ likedAt: _likedAt, ...t }) => t as Track), [liked]);
  const detail: CollectionDetail = {
    kind: 'playlist',
    id: 'LM',
    title: '좋아요 표시한 음악',
    subtitle: '자동 재생목록',
    tracks,
  };
  return (
    <CollectionView
      detail={detail}
      tracks={tracks}
      complete
      getAllTracks={async () => tracks}
      path="/playlist?list=LM"
      savable={false}
      art={
        <div className="liked-art">
          <MdThumbUp />
        </div>
      }
      empty="좋아요 표시한 노래가 여기에 표시됩니다"
    />
  );
}

interface ViewProps {
  detail: CollectionDetail;
  tracks: Track[];
  complete: boolean;
  getAllTracks: () => Promise<Track[]>;
  path: string;
  savable: boolean;
  art?: React.ReactNode;
  empty?: string;
}

function CollectionView({ detail, tracks, complete, getAllTracks, path, savable, art, empty }: ViewProps) {
  const isAlbum = detail.kind === 'album';
  const saved = useLibrary((s) => s.saved.some((x) => x.id === detail.id));
  const playingHere = usePlayer((s) => s.source?.path === path && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'));
  const isSourceHere = usePlayer((s) => s.source?.path === path && s.queue.length > 0);
  const [expanded, setExpanded] = useState(false);

  const source = { title: detail.title, path };
  const collection = {
    kind: (isAlbum ? 'album' : 'playlist') as 'album' | 'playlist',
    id: detail.id,
    title: detail.title,
    subtitle: [isAlbum ? '앨범' : '재생목록', detail.author?.name].filter(Boolean).join(' • '),
    thumbnail: detail.thumbnail,
  };

  const playAll = async (shuffle = false) => {
    if (!shuffle && isSourceHere) return player().togglePlay();
    const all = complete ? tracks : await getAllTracks();
    if (!all.length) return toast('재생할 수 있는 곡이 없습니다');
    player().playTracks(all, 0, source, { shuffle });
  };

  const playIndex = async (i: number) => {
    // 화면의 목록은 전체 목록의 앞부분이므로 인덱스가 그대로 유지된다
    const all = complete ? tracks : await getAllTracks();
    player().playTracks(all, i, source);
  };

  const menu = (e: MouseEvent) =>
    openMenuFromEvent(e, collectionMenuItems({ collection, getTracks: getAllTracks, path }));

  const total = formatTotal(tracks);
  const secondLine =
    detail.secondSubtitle ??
    [tracks.length ? `${tracks.length}곡` : '', total].filter(Boolean).join(' • ');

  return (
    <div className="collection">
      <div className="collection__backdrop">
        {detail.thumbnail && <Thumb src={detail.thumbnail} size={120} />}
      </div>
      <div className="collection__layout">
        <header className="collection__header">
          <div className="collection__art">{art ?? <Thumb src={detail.thumbnail} videoId={tracks[0]?.videoId} size={264} />}</div>
          <h1 className="collection__title">{detail.title}</h1>
          {detail.author && (
            <div className="collection__author">
              {detail.author.id ? (
                <Link to={`/channel/${detail.author.id}`} className="link">
                  {detail.author.name}
                </Link>
              ) : (
                detail.author.name
              )}
            </div>
          )}
          <div className="collection__meta">{detail.subtitle}</div>
          {secondLine && <div className="collection__meta">{secondLine}</div>}
          {detail.description && (
            <p className={`collection__desc ${expanded ? 'collection__desc--expanded' : ''}`} onClick={() => setExpanded((x) => !x)}>
              {detail.description}
            </p>
          )}
          <div className="collection__actions">
            {savable ? (
              <IconButton
                label={saved ? '보관함에서 삭제' : '보관함에 저장'}
                className="icon-btn--filled"
                onClick={() => toast(useLibrary.getState().toggleSaved(collection) ? '보관함에 저장됨' : '보관함에서 삭제됨')}
              >
                {saved ? <MdLibraryAddCheck /> : <MdLibraryAdd />}
              </IconButton>
            ) : (
              <IconButton label="셔플" className="icon-btn--filled" onClick={() => playAll(true)} disabled={!tracks.length}>
                <MdShuffle />
              </IconButton>
            )}
            <button type="button" className="play-big" aria-label={playingHere ? '일시중지' : '재생'} onClick={() => playAll(false)} disabled={!tracks.length}>
              {playingHere ? <MdPause /> : <MdPlayArrow />}
            </button>
            {savable ? (
              <IconButton label="더보기" className="icon-btn--filled" onClick={menu}>
                <MdMoreVert />
              </IconButton>
            ) : (
              <span className="collection__action-spacer" />
            )}
          </div>
          {savable && (
            <button type="button" className="btn btn--chip collection__shuffle" onClick={() => playAll(true)} disabled={!tracks.length}>
              <MdShuffle /> 셔플
            </button>
          )}
        </header>

        <div className="collection__body">
          {tracks.length ? (
            <TrackList tracks={tracks} numbered={isAlbum} showAlbum={!isAlbum} onPlayIndex={playIndex} />
          ) : (
            <div className="panel-empty">{empty ?? '이 재생목록에 재생 가능한 곡이 없습니다'}</div>
          )}
          {!complete && (
            <div className="collection__more">
              <div className="spinner spinner--sm" /> 나머지 곡을 불러오는 중… ({tracks.length}곡)
            </div>
          )}
          {isAlbum && total && <div className="collection__footer">{`${tracks.length}곡 • ${total}`}</div>}
          {detail.related?.map((s, i) => (
            <SectionView key={`${s.title}-${i}`} section={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
