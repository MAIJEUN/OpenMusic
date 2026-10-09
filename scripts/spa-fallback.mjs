// GitHub Pages는 SPA 라우팅을 지원하지 않으므로 index.html을 404.html로 복사해
// /OpenMusic/playlist?list=... 같은 경로로 바로 접속해도 앱이 열리게 한다.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';

if (existsSync('dist/index.html')) {
  copyFileSync('dist/index.html', 'dist/404.html');
  writeFileSync('dist/.nojekyll', '');
}
