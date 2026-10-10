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
}

export interface ContinuationPage {
  tracks: Track[];
  continuation?: string;
}

export type SearchFilter = 'song' | 'video';

export interface SearchResult {
  query: string;
  filter: SearchFilter;
  tracks: Track[];
}

export interface Lyrics {
  text: string;
  source?: string;
}

/** YouTube 자막 언어 */
export interface CaptionTrack {
  /** 언어 코드 (예: ko, en, ja) */
  code: string;
  /** 표시 이름 (예: 한국어, 영어(자동 생성됨)) */
  name: string;
  /** 자동 생성 자막 여부 */
  auto: boolean;
}

/** 시간이 붙은 자막 한 줄 (초) */
export interface CaptionLine {
  start: number;
  end: number;
  text: string;
}

export interface Captions {
  tracks: CaptionTrack[];
  /** 지금 내용의 언어 코드 */
  lang: string;
  lines: CaptionLine[];
}

export interface UpNext {
  playlistId?: string;
  title?: string;
  tracks: Track[];
}

export interface ServerConfig {
  mock: boolean;
  lang: string;
  location: string;
}
