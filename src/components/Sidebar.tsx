import type { MouseEvent } from 'react';
import { MdAdd, MdClose, MdHome, MdOutlineHome } from 'react-icons/md';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { collectionPath, useLibrary, type SavedCollection } from '../store/library';
import { usePlayer } from '../store/player';
import { toast, useUi } from '../store/ui';
import { Equalizer } from './Equalizer';
import { collectionMenuItems, openMenuFromEvent } from './menus';
import { tracksOf } from './PlaylistCard';
import { Thumb } from './Thumb';

function removeWithUndo(c: SavedCollection) {
  useLibrary.getState().remove(c.id);
  toast(`'${c.title}'을(를) 사이드바에서 삭제했습니다`, {
    actionLabel: '실행취소',
    action: () => useLibrary.getState().register(c),
  });
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setDialog = useUi((s) => s.setDialog);
  const saved = useLibrary((s) => s.saved);
  const playingPath = usePlayer((s) => (s.status === 'playing' || s.status === 'buffering' ? s.source?.path : undefined));
  const location = useLocation();
  const navigate = useNavigate();
  const current = location.pathname + location.search;

  const menu = (e: MouseEvent, c: SavedCollection) => openMenuFromEvent(e, collectionMenuItems(c, () => tracksOf(c)));

  return (
    <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} aria-label="가이드">
      <div className="sidebar__nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}>
          {({ isActive }) => (
            <>
              <span className="sidebar__icon">{isActive ? <MdHome /> : <MdOutlineHome />}</span>
              <span className="sidebar__label">홈</span>
            </>
          )}
        </NavLink>
      </div>

      <div className="sidebar__divider" />

      <button type="button" className="sidebar__new" onClick={() => setDialog('addLink')} title="재생목록 추가">
        <MdAdd />
        <span className="sidebar__new-label">재생목록 추가</span>
      </button>

      <div className="sidebar__playlists">
        {saved.length === 0 && !collapsed && (
          <p className="sidebar__empty">재생목록 링크를 열면 여기에 등록되어 언제든 다시 불러올 수 있어요.</p>
        )}
        {saved.map((c) => {
          const path = collectionPath(c);
          return (
            <div
              key={c.id}
              role="link"
              tabIndex={0}
              title={c.title}
              className={`sidebar__playlist ${current === path ? 'sidebar__playlist--active' : ''}`}
              onClick={() => navigate(path)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(path)}
              onContextMenu={(e) => menu(e, c)}
            >
              <Thumb src={c.thumbnail} size={40} className="sidebar__thumb" />
              <span className="sidebar__playlist-text">
                <span className="sidebar__playlist-title">{c.title}</span>
                {c.subtitle && <span className="sidebar__playlist-sub">{c.subtitle}</span>}
              </span>
              {playingPath === path && <Equalizer />}
              <button
                type="button"
                className="sidebar__remove"
                aria-label="사이드바에서 삭제"
                title="사이드바에서 삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  removeWithUndo(c);
                }}
              >
                <MdClose />
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
