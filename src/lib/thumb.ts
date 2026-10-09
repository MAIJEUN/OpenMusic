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
  const m = url.match(/^(https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[\w-]{11}\/)[^?]+/);
  if (m) {
    const name = size <= 120 ? 'default' : size <= 320 ? 'mqdefault' : size <= 480 ? 'hqdefault' : 'maxresdefault';
    return `${m[1]}${name}.jpg`;
  }
  return url;
}

export function videoThumb(videoId: string, quality: 'mq' | 'hq' | 'maxres' = 'hq'): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}default.jpg`;
}
