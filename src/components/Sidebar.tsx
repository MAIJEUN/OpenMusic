import type { MouseEvent } from 'react';
import { MdAdd, MdClose, MdHome, MdLink, MdOutlineHome, MdSearch } from 'react-icons/md';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { collectionPath, likedInfo, localInfo, useLibrary, type CollectionInfo, type SavedCollection } from '../store/library';
import { usePlayer } from '../store/player';
import { toast, useUi } from '../store/ui';
import { CollectionArt } from './CollectionArt';
import { Equalizer } from './Equalizer';
import { collectionMenuItems, deleteLocalPlaylist, openMenuFromEvent } from './menus';
import { tracksOf } from './PlaylistCard';

function removeLinked(c: SavedCollection) {
  useLibrary.getState().remove(c.id);
  toast(`'${c.title}'을(를) 사이드바에서 삭제했습니다`, {
    actionLabel: '실행취소',
    action: () => useLibrary.getState().register(c),
  });
}

const NAV = [
  { to: '/', label: '홈', icon: <MdOutlineHome />, activeIcon: <MdHome /> },
  { to: '/search', label: '검색', icon: <MdSearch />, activeIcon: <MdSearch /> },
];

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setDialog = useUi((s) => s.setDialog);
  const saved = useLibrary((s) => s.saved);
  const playlists = useLibrary((s) => s.playlists);
  const liked = useLibrary((s) => s.liked);
  const playingPath = usePlayer((s) => (s.status === 'playing' || s.status === 'buffering' ? s.source?.path : undefined));
  const location = useLocation();
  const navigate = useNavigate();
  const current = location.pathname + location.search;

  const item = (info: CollectionInfo, onRemove?: () => void, removeLabel = '사이드바에서 삭제') => {
    const path = collectionPath(info);
    const menu = (e: MouseEvent) =>
      openMenuFromEvent(e, collectionMenuItems(info, () => tracksOf(info), { onDeleted: () => current === path && navigate('/') }));
    return (
      <div
        key={info.id}
        role="link"
        tabIndex={0}
        title={info.title}
        className={`sidebar__playlist ${current === path ? 'sidebar__playlist--active' : ''}`}
        onClick={() => navigate(path)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(path)}
        onContextMenu={menu}
      >
        <CollectionArt info={info} size={40} className="sidebar__thumb" />
        <span className="sidebar__playlist-text">
          <span className="sidebar__playlist-title">{info.title}</span>
          {info.subtitle && <span className="sidebar__playlist-sub">{info.subtitle}</span>}
        </span>
        {playingPath === path && <Equalizer />}
        {onRemove && (
          <button
            type="button"
            className="sidebar__remove"
            aria-label={removeLabel}
            title={removeLabel}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <MdClose />
          </button>
        )}
      </div>
    );
  };

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

      <div className="sidebar__divider" />

      <div className="sidebar__actions">
        <button type="button" className="sidebar__new" onClick={() => setDialog({ type: 'newPlaylist' })} title="새 재생목록">
          <MdAdd />
          <span className="sidebar__new-label">새 재생목록</span>
        </button>
        <button type="button" className="sidebar__link" onClick={() => setDialog({ type: 'addLink' })} title="링크로 불러오기" aria-label="링크로 불러오기">
          <MdLink />
        </button>
      </div>

      <div className="sidebar__playlists">
        {item(likedInfo(liked))}
        {playlists.map((p) => item(localInfo(p), () => deleteLocalPlaylist(p.id, () => current === collectionPath(localInfo(p)) && navigate('/')), '재생목록 삭제'))}
        {saved.map((c) => item(c, () => removeLinked(c)))}
        {saved.length === 0 && playlists.length === 0 && !collapsed && (
          <p className="sidebar__empty">새 재생목록을 만들거나, YouTube Music 재생목록 링크를 열면 여기에 표시돼요.</p>
        )}
      </div>
    </nav>
  );
}
