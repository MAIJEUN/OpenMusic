import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ContextMenu } from './components/ContextMenu';
import { Dialogs } from './components/Dialogs';
import { NowPlaying } from './components/NowPlaying';
import { PlayerBar } from './components/PlayerBar';
import { Sidebar } from './components/Sidebar';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { useShortcuts } from './hooks/useShortcuts';
import { BrowseRoute, PlaylistRoute } from './pages/CollectionPage';
import { HomePage } from './pages/HomePage';
import { WatchPage } from './pages/WatchPage';
import { PlayerHost } from './player/PlayerHost';
import { usePlayer } from './store/player';
import { useUi } from './store/ui';

function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    useUi.getState().setNowPlaying(false);
  }, [pathname, search]);
  return null;
}

export default function App() {
  useShortcuts();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const npOpen = useUi((s) => s.nowPlayingOpen);
  const hasPlayer = usePlayer((s) => s.queue.length > 0);

  return (
    <div className={`app ${collapsed ? 'app--collapsed' : ''} ${hasPlayer ? 'app--has-player' : ''} ${npOpen ? 'app--np' : ''}`}>
      <ScrollToTop />
      <TopBar />
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/playlist" element={<PlaylistRoute />} />
          <Route path="/browse/:id" element={<BrowseRoute />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <NowPlaying />
      <PlayerBar />
      <PlayerHost />
      <ContextMenu />
      <Dialogs />
      <Toasts />
    </div>
  );
}
