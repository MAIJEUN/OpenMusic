import type { LyricsQuery } from './lyrics.js';
import type { CollectionDetail, ContinuationPage, Lyrics, SearchFilter, SearchResult, UpNext } from '../shared/types.js';

/** 메타데이터 공급자 (실제 YouTube Music 또는 개발용 목 데이터) */
export interface Provider {
  playlist(id: string): Promise<CollectionDetail>;
  continuation(token: string): Promise<ContinuationPage>;
  album(id: string): Promise<CollectionDetail>;
  upNext(videoId?: string, playlistId?: string): Promise<UpNext>;
  /** 가사. q는 외부 가사 DB(LRCLIB) 검색용 곡 정보 */
  lyrics(videoId: string, q?: LyricsQuery): Promise<Lyrics | null>;
  search(query: string, filter: SearchFilter): Promise<SearchResult>;
}
