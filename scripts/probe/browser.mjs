// 임시 진단: 실제 브라우저에서 SoundCloud 위젯 재생 + Spotify 곡 재생 확인
import { chromium } from 'playwright';
const B = 'http://localhost:3001';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = () => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('om-player') || '{}').state;
  return { id: s?.queue?.[s.index]?.track?.videoId, pos: document.querySelector('.player-bar')?.textContent?.match(/\d+:\d+ \/ \d+:\d+/)?.[0] };
});
await page.goto(B + '/search?q=lofi%20hip%20hop&filter=soundcloud');
await page.waitForSelector('.track-row', { timeout: 30000 });
console.log('PROBE rows', await page.locator('.track-row').count());
await page.locator('.track-row').first().dblclick();
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(4000);
  console.log('PROBE sc', JSON.stringify(await state()));
}
await page.locator('.player-bar__left [aria-label="재생/일시중지"], .player-bar [aria-label="일시중지"]').first().click().catch(() => {});
await page.waitForTimeout(1500);
console.log('PROBE after pause', JSON.stringify(await state()));
await page.click('.player-bar__title');
await page.waitForTimeout(500);
await page.locator('.np__toggle button:has-text("동영상")').click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'probe-sc.png' });
await page.goto(B + '/playlist?list=' + encodeURIComponent('sp:playlist:37i9dQZF1DXcBWIGoYBM5M'));
await page.waitForSelector('.track-row', { timeout: 30000 });
console.log('PROBE sp rows', await page.locator('.track-row').count());
await page.click('.play-big');
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(4000);
  console.log('PROBE sp', JSON.stringify(await state()));
}
await page.click('.player-bar__left [aria-label="다음 곡"]');
await page.waitForTimeout(6000);
console.log('PROBE sp next', JSON.stringify(await state()));
console.log('PROBE errors', JSON.stringify(errors));
await browser.close();
