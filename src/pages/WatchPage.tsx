import { useEffect, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isMixList } from '../../shared/links';
import { api, loadAllTracks } from '../lib/api';
import { player } from '../store/player';
import { toast, useUi } from '../store/ui';
import { HomePage } from './HomePage';

/**
 * /watch?v=...&list=... 링크로 들어오면 해당 곡(과 재생목록)을 대기열에 올리고 플레이어 페이지를 연다.
 * 브라우저 자동재생 정책 때문에 재생은 사용자가 재생 버튼을 누를 때 시작된다.
 */
export function WatchPage() {
  const [params] = useSearchParams();
  const v = params.get('v');
  const list = params.get('list');
  const started = useRef(false);

  useEffect(() => {
    if (!v || started.current) return;
    started.current = true;
    (async () => {
      try {
        if (list && !isMixList(list)) {
          const detail = await api.playlist(list);
          const tracks = await loadAllTracks(detail);
          const index = Math.max(0, tracks.findIndex((t) => t.videoId === v));
          if (tracks.length) {
            player().playTracks(tracks, index, { title: detail.title, path: `/playlist?list=${encodeURIComponent(list)}` }, { autoplay: false });
            useUi.getState().setNowPlaying(true);
            return;
          }
        }
        const res = await api.upNext(v, list ?? undefined);
        if (!res.tracks.length) throw new Error('곡 정보를 찾을 수 없습니다.');
        const index = Math.max(0, res.tracks.findIndex((t) => t.videoId === v));
        player().playTracks(res.tracks, index, { title: res.title || '뮤직 스테이션' }, { autoplay: false });
        useUi.getState().setNowPlaying(true);
      } catch (err) {
        toast(`곡을 불러오지 못했습니다. ${(err as Error).message}`);
      }
    })();
  }, [v, list]);

  if (!v) return <Navigate to="/" replace />;
  return <HomePage />;
}
