import { useEffect } from 'react';
import { useLibrary } from '../store/library';
import { player } from '../store/player';
import { toast, useUi } from '../store/ui';

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** YouTube Music과 비슷한 키보드 단축키 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (useUi.getState().dialog) return;
      const p = player();
      const current = p.current();
      let handled = true;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          p.togglePlay();
          break;
        case 'j':
        case 'J':
          p.seekBy(-10);
          break;
        case 'l':
        case 'L':
          p.seekBy(10);
          break;
        case 'ArrowLeft':
          p.seekBy(e.shiftKey ? -5 : -10);
          break;
        case 'ArrowRight':
          p.seekBy(e.shiftKey ? 5 : 10);
          break;
        case 'n':
        case 'N':
          p.next();
          break;
        case 'p':
        case 'P':
          p.prev();
          break;
        case '=':
          p.setVolume(p.volume + 5);
          break;
        case '-':
          p.setVolume(p.volume - 5);
          break;
        case 'm':
        case 'M':
          p.toggleMute();
          break;
        case 'r':
        case 'R':
          p.cycleRepeat();
          break;
        case 's':
        case 'S':
          p.toggleShuffle();
          toast(p.shuffle ? '셔플 사용 안함' : '셔플 사용');
          break;
        case '+':
          if (current) toast(useLibrary.getState().toggleLike(current.track) ? '좋아요 표시한 음악에 추가됨' : '좋아요 표시한 음악에서 삭제됨');
          break;
        case '_':
          if (current && useLibrary.getState().toggleDislike(current.track)) p.next();
          break;
        case 'f':
        case 'F':
          if (current) useUi.getState().setNowPlaying(!useUi.getState().nowPlayingOpen);
          break;
        case '/':
          window.dispatchEvent(new Event('om:focus-search'));
          break;
        case '?':
          useUi.getState().setDialog('shortcuts');
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
