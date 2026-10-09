import { MdPlayArrow } from 'react-icons/md';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, SearchFilter } from '../../shared/types';
import { ListSection, openCard, playCard } from '../components/Cards';
import { ErrorView, Loading } from '../components/PageState';
import { Thumb } from '../components/Thumb';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: '모두' },
  { id: 'song', label: '노래' },
  { id: 'video', label: '동영상' },
  { id: 'album', label: '앨범' },
  { id: 'playlist', label: '커뮤니티 재생목록' },
  { id: 'artist', label: '아티스트' },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const filter = (params.get('filter') as SearchFilter) || 'all';
  const { loading, data, error, reload } = useAsync(() => (q ? api.search(q, filter) : Promise.resolve(null)), [q, filter]);

  const setFilter = (f: SearchFilter) => {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('filter');
    else next.set('filter', f);
    setParams(next);
    window.scrollTo(0, 0);
  };

  return (
    <div className="page search-page">
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip ${filter === f.id ? 'chip--active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {!q ? (
        <div className="panel-empty">검색어를 입력해 주세요</div>
      ) : loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} onRetry={reload} />
      ) : !data || (!data.top && !data.sections.length) ? (
        <div className="panel-empty">'{q}'에 대한 검색결과가 없습니다</div>
      ) : (
        <>
          {data.correctedQuery && (
            <p className="search-page__corrected">
              다음 검색결과 표시: <Link to={`/search?q=${encodeURIComponent(data.correctedQuery)}`} className="link">{data.correctedQuery}</Link>
            </p>
          )}
          {data.top && <TopResult card={data.top} />}
          {data.sections.map((s, i) => (
            <ListSection key={`${s.title}-${i}`} section={s} />
          ))}
        </>
      )}
    </div>
  );
}

function TopResult({ card }: { card: Card }) {
  const navigate = useNavigate();
  return (
    <section className="list-section">
      <h2 className="list-section__title">인기 결과</h2>
      <div className="top-result" onClick={() => openCard(card, navigate)}>
        <Thumb src={card.thumbnail} videoId={card.track?.videoId} size={96} round={card.kind === 'artist'} className="top-result__thumb" />
        <div className="top-result__text">
          <div className="top-result__title">{card.title}</div>
          <div className="top-result__sub">{card.subtitle}</div>
        </div>
        {card.kind !== 'artist' && (
          <button
            type="button"
            className="btn btn--white"
            onClick={(e) => {
              e.stopPropagation();
              void playCard(card);
            }}
          >
            <MdPlayArrow /> 재생
          </button>
        )}
        {card.kind === 'artist' && (
          <button
            type="button"
            className="btn btn--white"
            onClick={(e) => {
              e.stopPropagation();
              void playCard(card, { shuffle: true });
            }}
          >
            <MdPlayArrow /> 셔플
          </button>
        )}
      </div>
    </section>
  );
}
