import { MdAdd, MdExplore, MdHome, MdLibraryMusic, MdOutlineExplore, MdOutlineHome, MdOutlineLibraryMusic, MdThumbUp } from 'react-icons/md';
import { NavLink, useLocation } from 'react-router-dom';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { Equalizer } from './Equalizer';

const NAV = [
  { to: '/', label: '홈', icon: <MdOutlineHome />, activeIcon: <MdHome /> },
  { to: '/explore', label: '둘러보기', icon: <MdOutlineExplore />, activeIcon: <MdExplore /> },
  { to: '/library', label: '보관함', icon: <MdOutlineLibraryMusic />, activeIcon: <MdLibraryMusic /> },
];

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setDialog = useUi((s) => s.setDialog);
  const saved = useLibrary((s) => s.saved);
  const likedCount = useLibrary((s) => s.liked.length);
  const sourcePath = usePlayer((s) => (s.status === 'playing' ? s.source?.path : undefined));
  const location = useLocation();
  const current = location.pathname + location.search;

  return (
    <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} aria-label="가이드">
      <div className="sidebar__nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}>
            {({ isActive }) => (
              <>
                <span className="sidebar__icon">{isActive ? n.activeIcon : n.icon}</span>
                <span className="sidebar__label">{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {!collapsed && (
        <>
          <div className="sidebar__divider" />
          <button type="button" className="sidebar__new" onClick={() => setDialog('addLink')}>
            <MdAdd />
            <span>재생목록 추가</span>
          </button>
          <div className="sidebar__playlists">
            <NavLink to="/playlist?list=LM" className={`sidebar__playlist ${current === '/playlist?list=LM' ? 'sidebar__playlist--active' : ''}`}>
              <span className="sidebar__playlist-text">
                <span className="sidebar__playlist-title">
                  <MdThumbUp className="sidebar__pin" /> 좋아요 표시한 음악
                </span>
                <span className="sidebar__playlist-sub">자동 재생목록 • {likedCount}곡</span>
              </span>
              {sourcePath === '/playlist?list=LM' && <Equalizer />}
            </NavLink>
            {saved.map((c) => {
              const path = c.kind === 'album' ? `/browse/${c.id}` : c.kind === 'artist' ? `/channel/${c.id}` : `/playlist?list=${encodeURIComponent(c.id)}`;
              return (
                <NavLink key={c.id} to={path} className={`sidebar__playlist ${current === path ? 'sidebar__playlist--active' : ''}`}>
                  <span className="sidebar__playlist-text">
                    <span className="sidebar__playlist-title">{c.title}</span>
                    <span className="sidebar__playlist-sub">{c.subtitle}</span>
                  </span>
                  {sourcePath === path && <Equalizer />}
                </NavLink>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}
