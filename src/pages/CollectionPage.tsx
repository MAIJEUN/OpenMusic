import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { MdContentCopy, MdMoreVert, MdPause, MdPlayArrow, MdShuffle } from 'react-icons/md';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { CollectionDetail, Track } from '../../shared/types';
import { isMixList } from '../../shared/links';
import { IconButton } from '../components/IconButton';
import { askCopyLinked, collectionMenuItems, openMenuFromEvent } from '../components/menus';
import { ErrorView, Loading } from '../components/PageState';
import { Thumb } from '../components/Thumb';
import { TrackList } from '../components/TrackRow';
import { useAsync } from '../hooks/useAsync';
import { api, loadAllTracks, PartialLoadError } from '../lib/api';
import { formatTotal } from '../lib/format';
import { LIKED_ID, isLocalId, useLibrary, type CollectionInfo } from '../store/library';
import { LikedPage, LocalPlaylistPage } from './MyPlaylistPage';
import { player, usePlayer } from '../store/player';
import { applyLatest } from '../player/usePlaylistSync';
import { toast, type LinkedEdit } from '../store/ui';

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

/** 화면에 보이는 목록이 같은지 (곡 순서·제목·썸네일) */
const sameDetail = (a: CollectionDetail, b: CollectionDetail) =>
  a.title === b.title &&
  a.thumbnail === b.thumbnail &&
  a.tracks.length === b.tracks.length &&
  a.tracks.every((t, i) => t.videoId === b.tracks[i].videoId && t.title === b.tracks[i].title);

function RemoteCollection({ kind, id }: { kind: 'playlist' | 'album' | 'radio'; id: string }) {
  const { loading, data: cachedData, error, reload } = useAsync(() => fetchCollection(kind, id), [kind, id]);
  // 캐시된 목록을 먼저 보여주고, 원본을 새로 받아 바뀌었으면 바꿔 보여준다 (원본 재생목록의 추가·삭제·순서 변경 반영)
  const [fresh, setFresh] = useState<CollectionDetail | null>(null);
  const data = fresh ?? cachedData;
  const path = `/playlist?list=${encodeURIComponent(cachedData?.id ?? id)}`;
  useEffect(() => {
    if (!cachedData || kind !== 'playlist') return;
    let alive = true;
    api
      .playlistFresh(id)
      .then((d) => {
        if (!alive) return;
        // 한 페이지로 끝나는 목록이 그대로면 화면은 그대로 두고 대기열만 확인
        if (!d.continuation && !cachedData.continuation && sameDetail(d, cachedData)) applyLatest(path, d.tracks);
        else setFresh(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedData]);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [complete, setComplete] = useState(false);
  const fullRef = useRef<Promise<Track[]> | null>(null);

  // 이어받기 토큰이 있으면 나머지 트랙을 백그라운드로 불러온다
  const [failed, setFailed] = useState<{ tracks: Track[]; token: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!data) return;
    const resumeFrom = attempt > 0 ? failed ?? undefined : undefined;
    if (!resumeFrom) setTracks(data.tracks);
    setFailed(null);
    setComplete(!data.continuation);
    // 새로 받은 원본 목록이면 전체를 받은 뒤 재생 중인 대기열에도 반영
    const isFresh = data === fresh;
    if (!data.continuation) {
      fullRef.current = Promise.resolve(data.tracks);
      if (isFresh) applyLatest(path, data.tracks);
      return;
    }
    let alive = true;
    fullRef.current = loadAllTracks(data, (t) => alive && setTracks(t), resumeFrom)
      .then((all) => {
        if (alive) setComplete(true);
        if (alive && isFresh && !resumeFrom) applyLatest(path, all);
        return all;
      })
      .catch((err) => {
        // 중간에 끊기면 그때까지 받은 곡은 그대로 두고, 나머지를 다시 불러올 수 있게 한다
        const partial = err instanceof PartialLoadError ? err : null;
        if (alive) {
          if (partial) setFailed({ tracks: partial.tracks, token: partial.token });
          setComplete(true);
          toast(`일부 곡을 불러오지 못했습니다 (${partial?.tracks.length ?? data.tracks.length}곡까지). ${(err as Error).message}`);
        }
        return partial?.tracks ?? data.tracks;
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, attempt]);

  // 연 재생목록/앨범은 사이드바에 자동 등록 (이미 있으면 제목·썸네일 갱신)
  useEffect(() => {
    if (!data || data.kind === 'radio') return;
    const info = toCollectionInfo(data);
    useLibrary.getState().register({ ...info, kind: data.kind === 'album' ? 'album' : 'playlist' });
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error} onRetry={reload} />;

  return (
    <CollectionView
      detail={data}
      tracks={tracks ?? data.tracks}
      complete={complete}
      getAllTracks={() => fullRef.current ?? Promise.resolve(tracks ?? data.tracks)}
      path={data.kind === 'album' ? `/browse/${data.id}` : `/playlist?list=${encodeURIComponent(data.id)}`}
      registrable={data.kind !== 'radio'}
      onResume={failed ? () => setAttempt((n) => n + 1) : undefined}
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
  /** 이어받기가 중간에 끊겼을 때 나머지를 다시 불러오기 */
  onResume?: () => void;
}

function CollectionView({ detail, tracks, complete, getAllTracks, path, registrable, onResume }: ViewProps) {
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
    // 셔플 버튼은 셔플을 켜고 무작위 곡부터, 재생 버튼은 셔플이 켜져 있어도 첫 곡부터 (그 뒤 곡들만 섞임)
    player().playTracks(all, 0, source, shuffle ? { shuffle: true, randomStart: true } : {});
  };

  const playIndex = async (i: number) => {
    // 화면의 목록은 전체 목록의 앞부분이므로 인덱스가 그대로 유지된다
    const all = complete ? tracks : await getAllTracks();
    player().playTracks(all, i, source);
  };

  const menu = (e: MouseEvent) => openMenuFromEvent(e, collectionMenuItems(collection, getAllTracks));
  // 링크로 가져온 목록은 수정할 수 없어서, 수정하려 하면 복사 안내 창을 띄운다 (복사본에 그 수정을 바로 적용)
  // (곡 줄이 매번 다시 그려지지 않도록 같은 함수를 유지)
  const latest = useRef({ collection, getAllTracks });
  latest.current = { collection, getAllTracks };
  const askEditStable = useCallback((edit: LinkedEdit) => askCopyLinked(latest.current.collection, latest.current.getAllTracks, edit), []);
  const askEdit = registrable ? askEditStable : undefined;
  // 끌어서 순서 바꾸기도 같은 안내로 (곡이 많거나 같은 곡이 두 번 있으면 끌기 없음)
  const draggable = !!askEdit && complete && tracks.length > 1 && tracks.length <= 300 && new Set(tracks.map((t) => t.videoId)).size === tracks.length;
  const onMove = draggable
    ? (from: number, to: number) => askEdit({ type: 'move', videoId: tracks[from].videoId, targetVideoId: tracks[to].videoId, title: tracks[from].title })
    : undefined;

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
            {registrable && (
              <IconButton label="내 재생목록으로 복사" className="icon-btn--filled" onClick={() => askCopyLinked(collection, getAllTracks)} disabled={!tracks.length}>
                <MdContentCopy />
              </IconButton>
            )}
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
            <TrackList tracks={tracks} numbered={isAlbum} showAlbum={!isAlbum} onPlayIndex={playIndex} onLinkedEdit={askEdit} onMove={onMove} />
          ) : (
            <div className="panel-empty">이 재생목록에 재생 가능한 곡이 없습니다</div>
          )}
          {!complete && (
            <div className="collection__more">
              <div className="spinner spinner--sm" /> 나머지 곡을 불러오는 중… ({tracks.length}곡)
            </div>
          )}
          {complete && onResume && (
            <div className="collection__more">
              {tracks.length}곡까지 불러왔어요.
              <button type="button" className="btn btn--outline" onClick={onResume}>
                나머지 곡 불러오기
              </button>
            </div>
          )}
          {isAlbum && total && <div className="collection__footer">{`${tracks.length}곡 • ${total}`}</div>}
        </div>
      </div>
    </div>
  );
}
