import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { MdLink, MdMenu, MdSearch } from 'react-icons/md';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { parseLink, targetToPath } from '../../shared/links';
import { useUi } from '../store/ui';
import { IconButton } from './IconButton';
import { Logo } from './Logo';

/** 상단 입력칸: 검색어면 노래 검색, 재생목록/곡 링크면 바로 연다 */
export function SearchBox({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = location.pathname === '/search' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQuery);
  useEffect(() => setValue(urlQuery), [urlQuery]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const target = parseLink(q);
    if (target) {
      setValue('');
      navigate(targetToPath(target));
      return;
    }
    const filter = params.get('filter');
    navigate(`/search?q=${encodeURIComponent(q)}${location.pathname === '/search' && filter ? `&filter=${filter}` : ''}`);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (parseLink(text)) {
      e.preventDefault();
      submit(text);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <form
      className="linkbox"
      role="search"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        submit(value);
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <MdSearch className="linkbox__icon" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
        placeholder="노래 검색 또는 재생목록 링크 붙여넣기"
        aria-label="노래 검색 또는 링크"
        spellCheck={false}
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
    </form>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const setDialog = useUi((s) => s.setDialog);
  const npOpen = useUi((s) => s.nowPlayingOpen);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`topbar ${scrolled || npOpen ? 'topbar--solid' : ''}`}>
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
        <IconButton label="검색" className="topbar__link-btn" onClick={() => navigate('/search')}>
          <MdSearch />
        </IconButton>
        <IconButton label="재생목록 링크 열기" className="topbar__link-btn" onClick={() => setDialog({ type: 'addLink' })}>
          <MdLink />
        </IconButton>
      </div>
    </header>
  );
}
