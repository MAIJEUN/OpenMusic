import { MdAdd, MdThumbUp } from 'react-icons/md';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MediaCard } from '../components/Cards';
import { TrackList } from '../components/TrackRow';
import { useLibrary } from '../store/library';
import { player } from '../store/player';
import { useUi } from '../store/ui';
import { savedToCard } from './HomePage';

const TABS = [
  { id: 'playlists', label: '재생목록' },
  { id: 'songs', label: '노래' },
  { id: 'albums', label: '앨범' },
  { id: 'artists', label: '아티스트' },
  { id: 'history', label: '기록' },
] as const;

type Tab = (typeof TABS)[number]['id'];

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'playlists';
  const saved = useLibrary((s) => s.saved);
  const liked = useLibrary((s) => s.liked);
  const history = useLibrary((s) => s.history);
  const setDialog = useUi((s) => s.setDialog);
  const navigate = useNavigate();

  const grid = (kind: 'playlist' | 'album' | 'artist', emptyText: string) => {
    const items = saved.filter((c) => c.kind === kind);
    return (
      <div className="grid">
        {kind === 'playlist' && (
          <>
            <div className="media-card new-card" onClick={() => setDialog('addLink')}>
              <div className="media-card__art new-card__art">
                <MdAdd />
              </div>
              <div className="media-card__title">재생목록 추가</div>
              <div className="media-card__subtitle">링크로 불러오기</div>
            </div>
            <div className="media-card" onClick={() => navigate('/playlist?list=LM')}>
              <div className="media-card__art liked-art">
                <MdThumbUp />
              </div>
              <div className="media-card__title">좋아요 표시한 음악</div>
              <div className="media-card__subtitle">자동 재생목록 • {liked.length}곡</div>
            </div>
          </>
        )}
        {items.map((c) => (
          <MediaCard key={c.id} card={savedToCard(c)} />
        ))}
        {!items.length && kind !== 'playlist' && <div className="panel-empty grid__empty">{emptyText}</div>}
      </div>
    );
  };

  return (
    <div className="page library">
      <div className="chips">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip ${tab === t.id ? 'chip--active' : ''}`}
            onClick={() => setParams(t.id === 'playlists' ? {} : { tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'playlists' && grid('playlist', '')}
      {tab === 'albums' && grid('album', '보관함에 저장한 앨범이 여기에 표시됩니다')}
      {tab === 'artists' && grid('artist', '저장한 아티스트가 여기에 표시됩니다')}
      {tab === 'songs' &&
        (liked.length ? (
          <TrackList tracks={liked} showAlbum onPlayIndex={(i) => player().playTracks(liked, i, { title: '좋아요 표시한 음악', path: '/playlist?list=LM' })} />
        ) : (
          <div className="panel-empty">좋아요 표시한 노래가 여기에 표시됩니다</div>
        ))}
      {tab === 'history' &&
        (history.length ? (
          <>
            <div className="library__history-head">
              <h2 className="list-section__title">최근 재생</h2>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => useLibrary.getState().clearHistory()}>
                기록 지우기
              </button>
            </div>
            <TrackList tracks={history} showAlbum onPlayIndex={(i) => player().playTracks(history, i, { title: '기록' })} />
          </>
        ) : (
          <div className="panel-empty">재생 기록이 여기에 표시됩니다</div>
        ))}
    </div>
  );
}
