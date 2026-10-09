import { useEffect, useState } from 'react';
import { MdKeyboard, MdLink, MdMenu, MdSearch } from 'react-icons/md';
import { useUi } from '../store/ui';
import { IconButton } from './IconButton';
import { Logo } from './Logo';
import { SearchBox } from './SearchBox';

export function TopBar() {
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const setDialog = useUi((s) => s.setDialog);
  const npOpen = useUi((s) => s.nowPlayingOpen);
  const [scrolled, setScrolled] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`topbar ${scrolled || npOpen ? 'topbar--solid' : ''}`}>
      {mobileSearch ? (
        <div className="topbar__mobile-search">
          <SearchBox onClose={() => setMobileSearch(false)} />
        </div>
      ) : (
        <>
          <div className="topbar__left">
            <IconButton label="가이드" className="topbar__menu" onClick={toggleSidebar}>
              <MdMenu />
            </IconButton>
            <Logo />
          </div>
          <div className="topbar__center">
            <SearchBox />
          </div>
          <div className="topbar__right">
            <IconButton label="검색" className="topbar__search-btn" onClick={() => setMobileSearch(true)}>
              <MdSearch />
            </IconButton>
            <IconButton label="재생목록 링크 열기" onClick={() => setDialog('addLink')}>
              <MdLink />
            </IconButton>
            <IconButton label="단축키" className="topbar__keys" onClick={() => setDialog('shortcuts')}>
              <MdKeyboard />
            </IconButton>
          </div>
        </>
      )}
    </header>
  );
}
