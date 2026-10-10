import type { Captions, CollectionDetail, ContinuationPage, Lyrics, SearchFilter, SearchResult, UpNext } from '../shared/types.js';

/** 메타데이터 공급자 (실제 YouTube Music 또는 개발용 목 데이터) */
export interface Provider {
  playlist(id: string): Promise<CollectionDetail>;
  continuation(token: string): Promise<ContinuationPage>;
  album(id: string): Promise<CollectionDetail>;
  upNext(videoId?: string, playlistId?: string): Promise<UpNext>;
  lyrics(videoId: string): Promise<Lyrics | null>;
  /** 영상의 YouTube 자막 (lang이 없으면 기본 자막) */
  captions(videoId: string, lang?: string): Promise<Captions | null>;
  search(query: string, filter: SearchFilter): Promise<SearchResult>;
}
