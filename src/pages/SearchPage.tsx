import { useSearchParams } from 'react-router-dom';
import type { SearchFilter } from '../../shared/types';
import { ErrorView, Loading } from '../components/PageState';
import { SearchBox } from '../components/TopBar';
import { TrackList } from '../components/TrackRow';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { player } from '../store/player';

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'song', label: '노래' },
  { id: 'video', label: '동영상' },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const filter: SearchFilter = params.get('filter') === 'video' ? 'video' : 'song';
  const { loading, data, error, reload } = useAsync(() => (q ? api.search(q, filter) : Promise.resolve(null)), [q, filter]);

  const setFilter = (f: SearchFilter) => {
    const next = new URLSearchParams(params);
    if (f === 'song') next.delete('filter');
    else next.set('filter', f);
    setParams(next, { replace: true });
  };

  return (
    <div className="page search-page">
      {/* 모바일에서는 상단바에 검색창이 없어서 여기에 둔다 */}
      <div className="search-page__box">
        <SearchBox autoFocus={!q} />
      </div>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip ${filter === f.id ? 'chip--active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {!q ? (
        <div className="panel-empty">듣고 싶은 노래나 아티스트를 검색해 보세요. 재생목록 링크를 붙여넣어도 돼요.</div>
      ) : loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} onRetry={reload} />
      ) : !data?.tracks.length ? (
        <div className="panel-empty">'{q}'에 대한 검색결과가 없습니다</div>
      ) : (
        <section>
          <h2 className="section-title">
            '{q}' {filter === 'video' ? '동영상' : '노래'}
          </h2>
          {/* 곡을 누르면 그 곡만 재생 (재생목록 없이 단순 재생) */}
          <TrackList
            tracks={data.tracks}
            showAlbum
            onPlayIndex={(i) => player().playTracks([data.tracks[i]], 0, { title: data.tracks[i].title })}
          />
        </section>
      )}
    </div>
  );
}
