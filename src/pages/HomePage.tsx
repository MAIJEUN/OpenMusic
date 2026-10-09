import type { Card, Section } from '../../shared/types';
import { Carousel, MediaCard, SectionView } from '../components/Cards';
import { LinkForm } from '../components/Dialogs';
import { Loading } from '../components/PageState';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useLibrary, type SavedCollection } from '../store/library';

export function savedToCard(c: SavedCollection): Card {
  return { kind: c.kind, id: c.id, title: c.title, subtitle: c.subtitle, thumbnail: c.thumbnail };
}

export function HomePage() {
  const recent = useLibrary((s) => s.recent);
  const history = useLibrary((s) => s.history);
  const feed = useAsync(() => api.home(), []);

  const historySection: Section | null = history.length
    ? {
        title: '다시 듣기',
        strapline: '최근에 들은 음악',
        layout: 'carousel',
        items: history.slice(0, 20).map((t) => ({
          kind: t.isVideo ? 'video' : 'song',
          id: t.videoId,
          title: t.title,
          subtitle: t.artists.map((a) => a.name).join(', '),
          thumbnail: t.thumbnail,
          track: t,
        })),
      }
    : null;

  return (
    <div className="page home">
      <section className="hero">
        <h1 className="hero__title">재생목록 링크를 붙여넣어 바로 들어보세요</h1>
        <p className="hero__desc">YouTube Music의 재생목록·앨범·아티스트 링크를 그대로 열 수 있어요. 주소의 music.youtube.com 부분만 이 사이트 주소로 바꿔도 됩니다.</p>
        <LinkForm />
      </section>

      {recent.length > 0 && (
        <Carousel title="최근 활동">
          {recent.map((c) => (
            <MediaCard key={c.id} card={savedToCard(c)} />
          ))}
        </Carousel>
      )}

      {historySection && <SectionView section={historySection} />}

      {feed.loading ? (
        <Loading />
      ) : (
        feed.data?.sections.map((s, i) => <SectionView key={`${s.title}-${i}`} section={s} />)
      )}
      {feed.error && !recent.length && !history.length && (
        <p className="home__note">추천 콘텐츠를 불러오지 못했습니다. 위 입력창에 재생목록 링크를 붙여넣어 시작해 보세요.</p>
      )}
    </div>
  );
}
