import { MdAdd } from 'react-icons/md';
import { LinkForm } from '../components/Dialogs';
import { PlaylistCard } from '../components/PlaylistCard';
import { likedInfo, localInfo, useLibrary } from '../store/library';
import { useUi } from '../store/ui';

export function HomePage() {
  const saved = useLibrary((s) => s.saved);
  const playlists = useLibrary((s) => s.playlists);
  const liked = useLibrary((s) => s.liked);
  const setDialog = useUi((s) => s.setDialog);

  return (
    <div className="page home">
      <section className="hero">
        <h1 className="hero__title">재생목록 링크를 붙여넣어 바로 들어보세요</h1>
        <p className="hero__desc">
          YouTube Music 재생목록·앨범 링크를 열면 사이드바에 등록돼요. 노래를 검색해서 바로 듣거나, 내 재생목록을 만들어 모아 둘 수도 있어요.
        </p>
        <LinkForm />
      </section>

      <section className="home__section">
        <h2 className="section-title">내 재생목록</h2>
        <div className="grid">
          <div className="media-card new-card" onClick={() => setDialog({ type: 'newPlaylist' })}>
            <div className="media-card__art new-card__art">
              <MdAdd />
            </div>
            <div className="media-card__title">새 재생목록</div>
            <div className="media-card__subtitle">직접 곡을 모아 만들기</div>
          </div>
          <PlaylistCard collection={likedInfo(liked)} />
          {playlists.map((p) => (
            <PlaylistCard key={p.id} collection={localInfo(p)} />
          ))}
        </div>
      </section>

      {saved.length > 0 && (
        <section className="home__section">
          <h2 className="section-title">불러온 재생목록</h2>
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
