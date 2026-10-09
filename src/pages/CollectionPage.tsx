import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { MdMoreVert, MdPause, MdPlayArrow, MdShuffle } from 'react-icons/md';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { CollectionDetail, Track } from '../../shared/types';
import { isMixList } from '../../shared/links';
import { IconButton } from '../components/IconButton';
import { collectionMenuItems, openMenuFromEvent } from '../components/menus';
import { ErrorView, Loading } from '../components/PageState';
import { Thumb } from '../components/Thumb';
import { TrackList } from '../components/TrackRow';
import { useAsync } from '../hooks/useAsync';
import { api, loadAllTracks } from '../lib/api';
import { formatTotal } from '../lib/format';
import { LIKED_ID, isLocalId, useLibrary, type CollectionInfo } from '../store/library';
import { LikedPage, LocalPlaylistPage } from './MyPlaylistPage';
import { player, usePlayer } from '../store/player';
import { toast } from '../store/ui';

export function PlaylistRoute() {
  const [params] = useSearchParams();
  const id = params.get('list');
  if (!id) return <Navigate to="/" replace />;
  if (id === LIKED_ID) return <LikedPage />;
  if (isLocalId(id)) return <LocalPlaylistPage key={id} id={id} />;
  return <RemoteCollection key={id} kind={isMixList(id) ? 'radio' : 'playlist'} id={id} />;
}

export function BrowseRoute() {
  const { id = '' } = useParams();
  if (id.startsWith('VL')) return <Navigate to={`/playlist?list=${encodeURIComponent(id.slice(2))}`} replace />;
  if (!id.startsWith('MPRE')) return <Navigate to="/" replace />;
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

  // 연 재생목록/앨범은 사이드바에 자동 등록 (이미 있으면 제목·썸네일 갱신)
  useEffect(() => {
    if (!data || data.kind === 'radio') return;
    const info = toCollectionInfo(data);
    useLibrary.getState().register({ ...info, kind: data.kind === 'album' ? 'album' : 'playlist' });
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
      registrable={data.kind !== 'radio'}
    />
  );
}

function toCollectionInfo(d: CollectionDetail): CollectionInfo {
  return {
    kind: d.kind === 'album' ? 'album' : 'playlist',
    id: d.id,
    title: d.title,
    subtitle: [d.kind === 'album' ? '앨범' : '재생목록', d.author?.name].filter(Boolean).join(' • '),
    thumbnail: d.thumbnail,
  };
}

interface ViewProps {
  detail: CollectionDetail;
  tracks: Track[];
  complete: boolean;
  getAllTracks: () => Promise<Track[]>;
  path: string;
  registrable: boolean;
}

function CollectionView({ detail, tracks, complete, getAllTracks, path, registrable }: ViewProps) {
  const isAlbum = detail.kind === 'album';
  const playingHere = usePlayer((s) => s.source?.path === path && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'));
  const isSourceHere = usePlayer((s) => s.source?.path === path && s.queue.length > 0);
  const [expanded, setExpanded] = useState(false);

  const source = { title: detail.title, path };
  const collection = toCollectionInfo(detail);

  const playAll = async (shuffle = false) => {
    if (!shuffle && isSourceHere) return player().togglePlay();
    const all = complete ? tracks : await getAllTracks();
    if (!all.length) return toast('재생할 수 있는 곡이 없습니다');
    // 셔플 버튼은 셔플을 켜고, 재생 버튼은 현재 셔플 모드를 따른다
    player().playTracks(all, 0, source, shuffle ? { shuffle: true, randomStart: true } : { randomStart: true });
  };

  const playIndex = async (i: number) => {
    // 화면의 목록은 전체 목록의 앞부분이므로 인덱스가 그대로 유지된다
    const all = complete ? tracks : await getAllTracks();
    player().playTracks(all, i, source);
  };

  const menu = (e: MouseEvent) => openMenuFromEvent(e, collectionMenuItems(collection, getAllTracks));

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
          <div className="collection__art">
            <Thumb src={detail.thumbnail} videoId={tracks[0]?.videoId} size={264} />
          </div>
          <h1 className="collection__title">{detail.title}</h1>
          {detail.author && <div className="collection__author">{detail.author.name}</div>}
          <div className="collection__meta">{detail.subtitle}</div>
          {secondLine && <div className="collection__meta">{secondLine}</div>}
          {detail.description && (
            <p className={`collection__desc ${expanded ? 'collection__desc--expanded' : ''}`} onClick={() => setExpanded((x) => !x)}>
              {detail.description}
            </p>
          )}
          <div className="collection__actions">
            <IconButton label="셔플" className="icon-btn--filled" onClick={() => playAll(true)} disabled={!tracks.length}>
              <MdShuffle />
            </IconButton>
            <button type="button" className="play-big" aria-label={playingHere ? '일시중지' : '재생'} onClick={() => playAll(false)} disabled={!tracks.length}>
              {playingHere ? <MdPause /> : <MdPlayArrow />}
            </button>
            {registrable ? (
              <IconButton label="더보기" className="icon-btn--filled" onClick={menu}>
                <MdMoreVert />
              </IconButton>
            ) : (
              <span className="collection__action-spacer" />
            )}
          </div>
        </header>

        <div className="collection__body">
          {tracks.length ? (
            <TrackList tracks={tracks} numbered={isAlbum} showAlbum={!isAlbum} onPlayIndex={playIndex} />
          ) : (
            <div className="panel-empty">이 재생목록에 재생 가능한 곡이 없습니다</div>
          )}
          {!complete && (
            <div className="collection__more">
              <div className="spinner spinner--sm" /> 나머지 곡을 불러오는 중… ({tracks.length}곡)
            </div>
          )}
          {isAlbum && total && <div className="collection__footer">{`${tracks.length}곡 • ${total}`}</div>}
        </div>
      </div>
    </div>
  );
}
