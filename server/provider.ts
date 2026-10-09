import type {
  ArtistDetail,
  Card,
  CollectionDetail,
  ContinuationPage,
  FeedPage,
  Lyrics,
  SearchFilter,
  SearchResult,
  UpNext,
} from '../shared/types.js';

export interface Suggestions {
  queries: string[];
  items: Card[];
}

/** 메타데이터 공급자 (실제 YouTube Music 또는 개발용 목 데이터) */
export interface Provider {
  playlist(id: string): Promise<CollectionDetail>;
  continuation(token: string): Promise<ContinuationPage>;
  album(id: string): Promise<CollectionDetail>;
  artist(id: string): Promise<ArtistDetail>;
  search(query: string, filter: SearchFilter): Promise<SearchResult>;
  suggestions(query: string): Promise<Suggestions>;
  upNext(videoId?: string, playlistId?: string): Promise<UpNext>;
  lyrics(videoId: string): Promise<Lyrics | null>;
  related(videoId: string): Promise<FeedPage>;
  home(): Promise<FeedPage>;
  explore(): Promise<FeedPage>;
}
