# OpenMusic

YouTube Music 재생목록 링크를 붙여넣으면 **YouTube Music과 같은 화면과 사용감**으로 재생할 수 있는 웹 플레이어입니다.

- 재생은 YouTube 공식 임베드 플레이어(IFrame Player API)로 합니다.
- 재생목록·앨범·가사 같은 메타데이터는 [youtubei.js](https://github.com/LuanRT/YouTube.js)로 가져옵니다.
- 로그인 없이 쓰며, 등록한 재생목록은 브라우저(localStorage)에 저장됩니다.

## 주요 기능

| 영역 | 기능 |
|---|---|
| 링크 열기 | `music.youtube.com/playlist?list=…`, `/browse/MPRE…`(앨범), `/watch?v=…&list=…`, `youtube.com`·`youtu.be` 재생목록 링크. 상단 입력칸에 붙여넣으면 바로 열립니다. 주소의 `music.youtube.com` 부분만 이 사이트 주소로 바꿔도 같은 페이지가 열립니다. |
| 재생목록 등록 | 연 재생목록·앨범은 사이드바(모바일은 홈)에 자동 등록되어 언제든 다시 불러올 수 있습니다. ✕ 버튼이나 메뉴로 삭제(실행취소 가능). 브라우저(localStorage)에 저장됩니다. |
| 재생 | 재생/일시중지, 이전/다음, 탐색(드래그), 볼륨, 반복(사용 안함/모두/한 곡), 재생 불가 곡 자동 건너뛰기 |
| 셔플 | 켜 두면 다른 재생목록·곡을 골라도 유지됩니다. 켜는 순간 지금 곡이 맨 앞에 오고 나머지 전체가 섞이며, 끄면 원래 순서로 돌아갑니다. 셔플 중 곡을 누르면 그 곡부터, 재생 버튼은 무작위 곡부터 시작합니다. '모두 반복'으로 한 바퀴 돌면 새 순서로 다시 섞습니다. |
| 실시간 스펙트럼 | 재생 바의 스펙트럼 버튼을 누르고 공유 창에서 **이 탭 + 탭 오디오 공유**를 선택하면, 실제 재생 중인 소리를 분석해 재생 바 배경과 재생 중 표시 막대에 보여줍니다. YouTube 플레이어는 다른 출처(iframe)라 소리를 직접 읽을 수 없어 탭 오디오 캡처를 사용하며, 데스크톱 Chrome·Edge에서 동작합니다. 꺼져 있을 때 막대는 움직이지 않습니다. |
| 플레이어 페이지 | 노래/동영상 전환, **다음 트랙**(드래그로 순서 변경, 삭제), **가사** |
| 기타 | 다음 곡으로 재생·현재 재생목록에 추가, 키보드 단축키(Space 재생, N/P 다음·이전, J/L 탐색, S 셔플, R 반복, M 음소거, F 플레이어 페이지), 미디어 키·잠금화면 컨트롤, 새로고침 후 대기열 복원, 모바일 레이아웃 |

## 구조

```
shared/   서버·클라이언트 공용 타입과 링크 파서
server/   API (Hono) — app.ts(라우트: 재생목록·앨범·가사·다음 트랙), youtube.ts(youtubei.js), normalize.ts(응답 정규화), mock.ts(목 데이터), node.ts(Node 실행)
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

### 사용자 도메인 연결 (예: `openmusic.kro.kr`)

1. 도메인 DNS에 **CNAME** 레코드를 추가합니다: `openmusic.kro.kr` → `<사용자>.github.io`
2. 저장소 **Settings → Pages → Custom domain**에 도메인을 입력하고 저장한 뒤, DNS 확인이 끝나면 **Enforce HTTPS**를 켭니다.
3. **Actions → Deploy → Run workflow**로 다시 배포합니다. 빌드 경로(`/OpenMusic/` ↔ `/`)는 Pages 설정에서 자동으로 감지됩니다.

등록한 재생목록은 브라우저에 주소(도메인)별로 저장되므로, 도메인을 바꾸면 새 주소에서 다시 등록해야 합니다.

## 참고 / 제한

- 소유자가 외부 사이트 재생을 막은 곡(오류 101/150)은 재생할 수 없어 자동으로 건너뜁니다.
- 브라우저 자동재생 정책 때문에 `/watch` 링크로 처음 들어오면 재생 버튼을 한 번 눌러야 합니다.
- YouTube 내부 API(InnerTube)는 예고 없이 바뀔 수 있습니다. 정보가 안 나오면 `youtubei.js`를 업데이트해 보세요.
- Cloudflare 무료 플랜은 요청당 CPU 시간이 짧습니다. 매우 큰 재생목록에서 오류가 나면 Workers 유료 플랜이나 Node 서버(`npm start`)로 배포하는 방법을 검토하세요.
- 개인 학습·비상업 용도로 만든 프로젝트입니다. YouTube 서비스 약관을 지켜서 사용하세요.
