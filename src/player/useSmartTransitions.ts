import { useEffect } from 'react';
import { skipSegments, type SkipSegment } from '../lib/sponsorblock';
import { player, usePlayer } from '../store/player';
import { toast, useUi } from '../store/ui';
import { spectrum } from './spectrum';

/**
 * 곡 사이를 매끄럽게 넘기는 기능 모음.
 * 1) 노래가 아닌 구간 건너뛰기: SponsorBlock 구간 중 중간 구간은 건너뛰고, 영상 끝까지 이어지는 구간은 '실제 노래 끝'으로 본다
 * 2) 크로스페이드: 실제 노래 끝 N초 전부터 다음 곡을 겹쳐 튼다
 * 3) 무음 건너뛰기: 실시간 스펙트럼이 켜져 있을 때 곡 후반부에 설정한 시간(기본 3초) 넘게 소리가 없으면 다음 곡으로
 */
export function useSmartTransitions() {
  useEffect(() => {
    let uid: string | undefined;
    let segments: SkipSegment[] = [];
    let skipped = new Set<SkipSegment>();
    let transitioned = false;
    let silenceSince = 0;

    const settings = () => useUi.getState().playback;

    const onTrack = () => {
      const s = usePlayer.getState();
      const item = s.queue[s.index];
      // 노래 ↔ 뮤직비디오로 바뀌면 구간 정보도 새로 받는다
      const key = item ? `${item.uid}:${s.playingId}` : undefined;
      if (key === uid) return;
      const sameTrack = uid?.split(':')[0] === item?.uid;
      uid = key;
      segments = [];
      skipped = new Set();
      if (!sameTrack) transitioned = false;
      silenceSince = 0;
      if (item && settings().skipNonMusic) {
        const id = key;
        skipSegments(s.playingId ?? item.track.videoId).then((list) => {
          if (uid === id) segments = list;
        });
      }
    };

    const tailSegment = (dur: number) => segments.find((seg) => seg.end >= dur - 1.5 && seg.start > 10);

    const evaluate = () => {
      onTrack();
      const s = usePlayer.getState();
      if (s.status !== 'playing' || transitioned) return;
      const dur = s.duration;
      const pos = s.position;
      if (!dur || dur < 5) return;
      const cfg = settings();

      // 중간의 노래 아닌 구간: 건너뛰기
      if (cfg.skipNonMusic) {
        for (const seg of segments) {
          if (seg.end < dur - 1.5 && pos >= seg.start && pos < seg.end - 0.5 && !skipped.has(seg)) {
            skipped.add(seg);
            player().seek(seg.end);
            toast('노래가 아닌 구간을 건너뛰었어요');
            return;
          }
        }
      }

      const tail = cfg.skipNonMusic ? tailSegment(dur) : undefined;
      const songEnd = tail ? tail.start : dur;
      const hasNext = s.index < s.queue.length - 1 || s.repeat === 'all';

      if (s.repeat === 'one') {
        // 한 곡 반복: 노래가 끝나면(아웃트로 전에) 처음부터
        if (tail && pos >= songEnd - 0.25) player().seek(0);
        return;
      }
      if (!hasNext) {
        if (tail && pos >= songEnd - 0.25) {
          transitioned = true;
          player().pause();
        }
        return;
      }

      const xf = cfg.crossfade;
      if (xf > 0 && dur > xf * 3 && pos >= songEnd - xf && pos < songEnd + 1) {
        transitioned = true;
        player().crossfadeNext(Math.max(1, Math.min(xf, songEnd - pos)));
        return;
      }
      if (tail && pos >= songEnd - 0.25) {
        transitioned = true;
        player().next();
      }
    };

    onTrack();
    const unsubPlayer = usePlayer.subscribe(evaluate);

    // 무음 감지 (실시간 스펙트럼이 켜져 있을 때만 프레임 데이터가 들어온다)
    const unsubFrames = spectrum.onFrame((freq) => {
      const s = usePlayer.getState();
      if (!settings().skipSilence || s.status !== 'playing' || transitioned) {
        silenceSince = 0;
        return;
      }
      const dur = s.duration;
      const pos = s.position;
      const wait = Math.max(0.5, settings().silenceSeconds) * 1000;
      // 곡 후반부(절반 이후, 30초 이후)이고 끝까지 1.5초 이상 남았을 때만
      if (!dur || pos < Math.max(30, dur * 0.5) || dur - pos < 1.5) {
        silenceSince = 0;
        return;
      }
      let sum = 0;
      const n = Math.floor(freq.length / 2);
      for (let i = 0; i < n; i++) sum += freq[i];
      const level = sum / (n * 255);
      const now = performance.now();
      if (level > 0.01) {
        silenceSince = 0;
        return;
      }
      if (!silenceSince) silenceSince = now;
      else if (now - silenceSince > wait) {
        transitioned = true;
        silenceSince = 0;
        const hasNext = s.index < s.queue.length - 1 || s.repeat === 'all';
        if (s.repeat === 'one') player().seek(0);
        else if (hasNext) {
          toast('곡 끝의 무음 구간을 건너뛰었어요');
          player().next();
        }
      }
    });

    return () => {
      unsubPlayer();
      unsubFrames();
    };
  }, []);
}
