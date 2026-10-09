/** 서버와 클라이언트가 공유하는 정규화된 데이터 모델 */

export interface ArtistRef {
  name: string;
  /** 채널 ID (UC...) */
  id?: string;
}

export interface AlbumRef {
  name: string;
  /** 앨범 browseId (MPREb_...) */
  id?: string;
}

export interface Track {
  videoId: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  /** 초 단위 길이 */
  duration?: number;
  thumbnail?: string;
  explicit?: boolean;
  /** true면 뮤직비디오/일반 동영상, false면 오디오 트랙(ATV) */
  isVideo?: boolean;
  /** 조회수, 재생 횟수 등 부가 정보 */
  extra?: string;
}

export type CardKind = 'song' | 'video' | 'album' | 'playlist' | 'artist' | 'radio' | 'unknown';

export interface Card {
  kind: CardKind;
  /** song/video: videoId, album: MPREb, playlist: playlistId(VL 접두사 제외), artist: UC... */
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  track?: Track;
  /** 라디오/믹스처럼 재생 컨텍스트가 있는 경우 */
  playlistId?: string;
}

export interface Section {
  title: string;
  strapline?: string;
  /** carousel: 가로 카드 목록, list: 곡 목록(세로) */
  layout: 'carousel' | 'list';
  items: Card[];
  /** 섹션 전체를 재생할 수 있는 플레이리스트 */
  playlistId?: string;
}

export interface CollectionDetail {
  kind: 'playlist' | 'album' | 'radio';
  id: string;
  title: string;
  /** 예: "재생목록 • 2024", "앨범 • 2023" */
  subtitle?: string;
  /** 예: "100곡 • 6시간 이상" */
  secondSubtitle?: string;
  author?: ArtistRef;
  description?: string;
  thumbnail?: string;
  year?: string;
  tracks: Track[];
  /** 남은 트랙을 불러오기 위한 토큰 */
  continuation?: string;
  /** 앨범의 OLAK... 재생목록 ID */
  audioPlaylistId?: string;
  related?: Section[];
}

export interface ContinuationPage {
  tracks: Track[];
  continuation?: string;
}

export interface ArtistDetail {
  id: string;
  name: string;
  thumbnail?: string;
  description?: string;
  subscribers?: string;
  songs: Track[];
  songsPlaylistId?: string;
  sections: Section[];
}

export interface SearchResult {
  query: string;
  correctedQuery?: string;
  top?: Card;
  sections: Section[];
}

export type SearchFilter = 'all' | 'song' | 'video' | 'album' | 'playlist' | 'artist';

export interface Lyrics {
  text: string;
  source?: string;
}

export interface UpNext {
  playlistId?: string;
  title?: string;
  tracks: Track[];
}

export interface FeedPage {
  sections: Section[];
}

export interface ServerConfig {
  mock: boolean;
  lang: string;
  location: string;
}
