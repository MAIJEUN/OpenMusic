/**
 * 썸네일 URL을 원하는 크기로 바꾼다.
 * - lh3.googleusercontent.com / yt3.ggpht.com: =w120-h120 같은 크기 접미사를 교체
 * - i.ytimg.com/vi/ID/...: 크기별 파일명 교체
 */
export function thumbSize(url: string | undefined, size: number): string | undefined {
  if (!url) return undefined;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    const base = url.replace(/=[^/]*$/, '');
    return `${base}=w${size}-h${size}-l90-rj`;
  }
  // SoundCloud 앨범 아트: -large(100) / -t300x300 / -t500x500
  if (/\.sndcdn\.com\//.test(url)) return url.replace(/-(large|t\d+x\d+)\./, size <= 100 ? '-large.' : size <= 300 ? '-t300x300.' : '-t500x500.');
  const m = url.match(/^(https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[\w-]{11}\/)[^?]+/);
  if (m) {
    const name = size <= 120 ? 'default' : size <= 320 ? 'mqdefault' : size <= 480 ? 'hqdefault' : 'maxresdefault';
    return `${m[1]}${name}.jpg`;
  }
  return url;
}

export function videoThumb(videoId: string, quality: 'mq' | 'hq' | 'maxres' = 'hq'): string | undefined {
  // SoundCloud·Spotify 곡은 YouTube 썸네일이 없다
  if (videoId.includes(':')) return undefined;
  return `https://i.ytimg.com/vi/${videoId}/${quality}default.jpg`;
}
