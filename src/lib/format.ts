import type { ArtistRef, Track } from '../../shared/types';

export function formatTime(sec?: number): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function artistNames(artists?: ArtistRef[]): string {
  return (artists ?? []).map((a) => a.name).join(', ');
}

/** "1시간 23분" / "45분" */
export function formatTotal(tracks: Track[]): string {
  const total = tracks.reduce((s, t) => s + (t.duration ?? 0), 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h >= 1) return m ? `${h}시간 ${m}분` : `${h}시간`;
  return `${Math.max(1, m)}분`;
}

export function trackSubtitle(t: Track): string {
  return [artistNames(t.artists), t.album?.name ?? t.extra].filter(Boolean).join(' • ');
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function shareUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${location.origin}${base}${path}`;
}
