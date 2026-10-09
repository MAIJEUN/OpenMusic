import { LinkForm } from '../components/Dialogs';
import { PlaylistCard } from '../components/PlaylistCard';
import { useLibrary } from '../store/library';

export function HomePage() {
  const saved = useLibrary((s) => s.saved);

  return (
    <div className="page home">
      <section className="hero">
        <h1 className="hero__title">재생목록 링크를 붙여넣어 바로 들어보세요</h1>
        <p className="hero__desc">
          YouTube Music 재생목록이나 앨범 링크를 열면 사이드바에 자동으로 등록되어 언제든 다시 불러올 수 있어요.
        </p>
        <LinkForm />
      </section>

      {saved.length > 0 && (
        <section>
          <h2 className="section-title">내 재생목록</h2>
          <div className="grid">
            {saved.map((c) => (
              <PlaylistCard key={c.id} collection={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
