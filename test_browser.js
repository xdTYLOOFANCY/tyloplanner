import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
  await page.goto('http://localhost:5000', { waitUntil: 'networkidle0' }).catch(e => console.log("GOTO ERROR:", e.message));
  await browser.close();
})();
