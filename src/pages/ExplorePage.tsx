import { SectionView } from '../components/Cards';
import { ErrorView, Loading } from '../components/PageState';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';

export function ExplorePage() {
  const { loading, data, error, reload } = useAsync(() => api.explore(), []);
  return (
    <div className="page">
      <h1 className="page__title">둘러보기</h1>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorView message={error} onRetry={reload} />
      ) : (
        data?.sections.map((s, i) => <SectionView key={`${s.title}-${i}`} section={s} />)
      )}
    </div>
  );
}
