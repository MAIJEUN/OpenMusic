import { MdFavorite, MdQueueMusic } from 'react-icons/md';
import type { CollectionInfo } from '../store/library';
import { Thumb } from './Thumb';

/**
 * 재생목록 커버. 좋아요 목록은 하트, 내 재생목록은 곡이 4개 이상이면 2x2 모자이크,
 * 그 외에는 대표 이미지 한 장.
 */
export function CollectionArt({ info, size, className = '' }: { info: CollectionInfo; size: number; className?: string }) {
  if (info.kind === 'liked') {
    return (
      <div className={`collection-art collection-art--liked ${className}`}>
        <MdFavorite />
      </div>
    );
  }
  const thumbs = info.thumbs ?? [];
  if (info.kind === 'local' && thumbs.length >= 4) {
    return (
      <div className={`collection-art collection-art--mosaic ${className}`}>
        {thumbs.slice(0, 4).map((src, i) => (
          <Thumb key={i} src={src} size={Math.ceil(size / 2)} />
        ))}
      </div>
    );
  }
  const src = info.thumbnail ?? thumbs[0];
  if (!src && info.kind === 'local') {
    return (
      <div className={`collection-art collection-art--empty ${className}`}>
        <MdQueueMusic />
      </div>
    );
  }
  return <Thumb src={src} size={size} className={`collection-art ${className}`} />;
}
