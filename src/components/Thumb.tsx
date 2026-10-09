import { useEffect, useState } from 'react';
import { MdMusicNote } from 'react-icons/md';
import { thumbSize, videoThumb } from '../lib/thumb';

interface Props {
  src?: string;
  /** 표시 크기(px) — 적절한 해상도를 고르는 데 사용 */
  size: number;
  /** 원본이 없거나 깨졌을 때 사용할 동영상 ID */
  videoId?: string;
  round?: boolean;
  className?: string;
  alt?: string;
}

export function Thumb({ src, size, videoId, round, className, alt = '' }: Props) {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const candidates = [
    thumbSize(src, Math.round(size * dpr)),
    src,
    videoId ? videoThumb(videoId, size > 200 ? 'hq' : 'mq') : undefined,
  ].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const key = candidates.join('|');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [key]);

  const url = candidates[attempt];
  return (
    <div className={`thumb ${round ? 'thumb--round' : ''} ${className ?? ''}`}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" draggable={false} onError={() => setAttempt((a) => a + 1)} />
      ) : (
        <div className="thumb__placeholder">
          <MdMusicNote />
        </div>
      )}
    </div>
  );
}
