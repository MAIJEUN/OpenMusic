import { MdExplore, MdHome, MdLibraryMusic, MdOutlineExplore, MdOutlineHome, MdOutlineLibraryMusic } from 'react-icons/md';
import { NavLink } from 'react-router-dom';
import { useUi } from '../store/ui';

const NAV = [
  { to: '/', label: '홈', icon: <MdOutlineHome />, activeIcon: <MdHome /> },
  { to: '/explore', label: '둘러보기', icon: <MdOutlineExplore />, activeIcon: <MdExplore /> },
  { to: '/library', label: '보관함', icon: <MdOutlineLibraryMusic />, activeIcon: <MdLibraryMusic /> },
];

export function BottomNav() {
  const close = useUi((s) => s.setNowPlaying);
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => close(false)} className={({ isActive }) => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}>
          {({ isActive }) => (
            <>
              {isActive ? n.activeIcon : n.icon}
              <span>{n.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
