import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { MdLink, MdMenu } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { parseLink, targetToPath } from '../../shared/links';
import { toast, useUi } from '../store/ui';
import { IconButton } from './IconButton';
import { Logo } from './Logo';

/** 상단의 링크 입력칸: 붙여넣거나 Enter를 누르면 바로 연다 */
function LinkBox() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  const open = (text: string) => {
    const target = parseLink(text);
    if (!target) {
      toast('YouTube Music 재생목록 링크를 입력해 주세요');
      return false;
    }
    setValue('');
    navigate(targetToPath(target));
    return true;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) open(value);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (parseLink(text)) {
      e.preventDefault();
      open(text);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <form className="linkbox" onSubmit={onSubmit}>
      <MdLink className="linkbox__icon" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
        placeholder="YouTube Music 재생목록 링크 붙여넣기"
        aria-label="재생목록 링크"
        spellCheck={false}
      />
    </form>
  );
}

export function TopBar() {
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
        <LinkBox />
      </div>
      <div className="topbar__right">
        <IconButton label="재생목록 링크 열기" className="topbar__link-btn" onClick={() => setDialog('addLink')}>
          <MdLink />
        </IconButton>
      </div>
    </header>
  );
}
