import { useEffect } from 'react';
import { MdLibraryAdd, MdLibraryAddCheck, MdOutlineSensors, MdShuffle } from 'react-icons/md';
import { Link, useParams } from 'react-router-dom';
import { SectionView } from '../components/Cards';
import { ErrorView, Loading } from '../components/PageState';
import { Thumb } from '../components/Thumb';
import { TrackList } from '../components/TrackRow';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useLibrary } from '../store/library';
import { player } from '../store/player';
import { toast } from '../store/ui';

export function ArtistPage() {
  const { id = '' } = useParams();
  const { loading, data, error, reload } = useAsync(() => api.artist(id), [id]);
  const saved = useLibrary((s) => s.saved.some((x) => x.id === id));

  useEffect(() => {
    if (data) {
      useLibrary.getState().touchRecent({ kind: 'artist', id: data.id, title: data.name, subtitle: '아티스트', thumbnail: data.thumbnail });
    }
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error} onRetry={reload} />;

  const source = { title: data.name, path: `/channel/${data.id}` };
  const collection = { kind: 'artist' as const, id: data.id, title: data.name, subtitle: '아티스트', thumbnail: data.thumbnail };

  return (
    <div className="artist">
      <div className="artist__hero">
        {data.thumbnail && <Thumb src={data.thumbnail} size={1080} className="artist__banner" />}
        <div className="artist__hero-content">
          <h1 className="artist__name">{data.name}</h1>
          {data.subscribers && <div className="artist__subs">{data.subscribers}</div>}
          {data.description && <p className="artist__desc">{data.description}</p>}
          <div className="artist__actions">
            <button
              type="button"
              className="btn btn--white"
              disabled={!data.songs.length}
              onClick={() => player().playTracks(data.songs, 0, source, { shuffle: true })}
            >
              <MdShuffle /> 셔플
            </button>
            <button
              type="button"
              className="btn btn--outline"
              disabled={!data.songs.length}
              onClick={() => data.songs[0] && player().startRadio(data.songs[0])}
            >
              <MdOutlineSensors /> 뮤직 스테이션
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => toast(useLibrary.getState().toggleSaved(collection) ? '보관함에 저장됨' : '보관함에서 삭제됨')}
            >
              {saved ? <MdLibraryAddCheck /> : <MdLibraryAdd />} {saved ? '저장됨' : '저장'}
            </button>
          </div>
        </div>
      </div>

      <div className="artist__body">
        {data.songs.length > 0 && (
          <section className="list-section">
            <div className="list-section__head">
              <h2 className="list-section__title">노래</h2>
              {data.songsPlaylistId && (
                <Link to={`/playlist?list=${encodeURIComponent(data.songsPlaylistId)}`} className="btn btn--outline btn--sm">
                  모두 보기
                </Link>
              )}
            </div>
            <TrackList tracks={data.songs} showAlbum onPlayIndex={(i) => player().playTracks(data.songs, i, source)} />
          </section>
        )}
        {data.sections.map((s, i) => (
          <SectionView key={`${s.title}-${i}`} section={s} />
        ))}
      </div>
    </div>
  );
}
