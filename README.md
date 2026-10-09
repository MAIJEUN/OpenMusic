# OpenMusic

YouTube Music 재생목록 링크를 붙여넣으면 **YouTube Music과 같은 화면과 사용감**으로 재생할 수 있는 웹 플레이어입니다.

- 재생은 YouTube 공식 임베드 플레이어(IFrame Player API)로 합니다.
- 재생목록·앨범·아티스트·가사 같은 메타데이터는 [youtubei.js](https://github.com/LuanRT/YouTube.js)로 가져옵니다.
- 로그인 없이 쓰며, 보관함·좋아요·기록은 브라우저(localStorage)에 저장됩니다.

## 주요 기능

| 영역 | 기능 |
|---|---|
| 링크 열기 | `music.youtube.com/playlist?list=…`, `/browse/MPRE…`(앨범), `/channel/UC…`(아티스트), `/watch?v=…&list=…`, `youtube.com`/`youtu.be` 링크. 검색창에 붙여넣어도 열립니다. 주소의 `music.youtube.com` 부분만 이 사이트 주소로 바꿔도 같은 페이지가 열립니다. |
| 재생 | 재생/일시중지, 이전/다음, 탐색(드래그), 볼륨, 셔플(해제 시 원래 순서 복원), 반복(사용 안함/모두/한 곡), 재생 불가 곡 자동 건너뛰기 |
| 플레이어 페이지 | 노래/동영상 전환, **다음 트랙**(드래그로 순서 변경, 삭제, 재생 중인 출처, 자동재생), **가사**, **관련 항목** |
| 대기열 | 다음 곡으로 재생, 현재 재생목록에 추가, 뮤직 스테이션(라디오) 시작, 자동재생(비슷한 음악 이어서 재생) |
| 탐색 | 홈 피드, 둘러보기, 검색(추천 검색어·검색 기록·필터 칩), 아티스트·앨범 페이지 |
| 보관함 | 재생목록/앨범/아티스트 저장, 좋아요 표시한 음악, 재생 기록 |
| 기타 | 키보드 단축키(`?`), 미디어 키·잠금화면 컨트롤(Media Session), 새로고침 후 대기열·재생 위치 복원, 모바일 레이아웃 |

## 구조

```
shared/   서버·클라이언트 공용 타입과 링크 파서
server/   API (Hono) — app.ts(라우트), youtube.ts(youtubei.js), normalize.ts(응답 정규화), mock.ts(목 데이터), node.ts(Node 실행)
worker/   Cloudflare Worker 진입점
src/      React 프론트엔드 (Vite)
```

## 로컬 실행

```bash
npm install
npm run dev        # 웹 http://localhost:5173 + API http://localhost:3001
npm run dev:mock   # YouTube 접속 없이 목 데이터로 UI 확인
```

자체 서버 하나로 띄우려면 `npm run build && npm start`를 실행하세요. `http://localhost:3001`에서 웹과 API를 함께 제공합니다.

환경 변수: `PORT`(기본 3001), `YT_LANG`(기본 `ko`), `YT_LOCATION`(기본 `KR`)

## 배포 (GitHub Pages + Cloudflare Workers)

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 다음을 실행합니다.

1. API를 Cloudflare Worker(`openmusic-api`)로 배포
2. 프론트엔드를 Worker 주소로 빌드해 GitHub Pages에 배포 → `https://<사용자>.github.io/<저장소>/`

처음 한 번 설정:

1. Cloudflare에서 **"Edit Cloudflare Workers"** 템플릿으로 API 토큰을 만들고, Workers & Pages 화면에서 **Account ID**를 확인합니다. (Workers를 처음 쓰면 workers.dev 서브도메인도 등록하세요.)
2. GitHub 저장소 **Settings → Secrets and variables → Actions**에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 추가합니다.
3. **Settings → Pages → Source**를 **GitHub Actions**로 설정합니다.
4. (선택) Worker 주소를 직접 지정하려면 Variables에 `API_BASE_URL`(예: `https://openmusic-api.xxx.workers.dev`)을 추가합니다.

## 참고 / 제한

- 소유자가 외부 사이트 재생을 막은 곡(오류 101/150)은 재생할 수 없어 자동으로 건너뜁니다.
- 브라우저 자동재생 정책 때문에 `/watch` 링크로 처음 들어오면 재생 버튼을 한 번 눌러야 합니다.
- YouTube 내부 API(InnerTube)는 예고 없이 바뀔 수 있습니다. 정보가 안 나오면 `youtubei.js`를 업데이트해 보세요.
- Cloudflare 무료 플랜은 요청당 CPU 시간이 짧습니다. 매우 큰 재생목록에서 오류가 나면 Workers 유료 플랜이나 Node 서버(`npm start`)로 배포하는 방법을 검토하세요.
- 개인 학습·비상업 용도로 만든 프로젝트입니다. YouTube 서비스 약관을 지켜서 사용하세요.
