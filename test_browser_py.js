const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:3005/index.html', { waitUntil: 'networkidle0' });
  const type = await page.evaluate(() => typeof window.closeEventModal);
  console.log('typeof window.closeEventModal:', type);
  await browser.close();
  process.exit(0);
})();
