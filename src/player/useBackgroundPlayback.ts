import { useEffect } from 'react';
import { isUserPaused, player, usePlayer } from '../store/player';

/** 화면이 꺼졌거나 다른 앱으로 간 상태에서 저절로 멈췄는지 */
export const pausedInBackground = () => document.visibilityState === 'hidden' && !isUserPaused();

/**
 * 모바일 백그라운드 재생 보조.
 * 모바일 브라우저는 페이지가 화면에서 사라지면 YouTube 플레이어(동영상)를 멈춘다.
 * 사용자가 멈춘 게 아니면 잠시 뒤 다시 재생을 시도하고, 화면으로 돌아왔을 때도 이어서 튼다.
 * (브라우저 정책에 따라 막힐 수 있다. 특히 iOS는 잠금 화면의 재생 버튼으로 다시 틀어야 할 수 있다.)
 */
export function useBackgroundPlayback() {
  useEffect(() => {
    let tries = 0;
    let wasInterrupted = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.status === 'playing') {
        tries = 0;
        wasInterrupted = false;
        return;
      }
      if (prev.status === 'playing' && s.status === 'paused' && pausedInBackground()) {
        wasInterrupted = true;
        // 바로 다시 틀면 또 멈추는 경우가 있어 간격을 늘려 가며 몇 번 시도한다
        if (tries < 4) {
          tries++;
          timers.push(setTimeout(() => !isUserPaused() && player().play(), 300 * tries));
        }
      }
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const s = usePlayer.getState();
      if (wasInterrupted && s.status === 'paused' && !isUserPaused()) player().play();
      wasInterrupted = false;
      tries = 0;
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      unsub();
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);
}
