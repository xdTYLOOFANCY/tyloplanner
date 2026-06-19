const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3010/index.html', { waitUntil: 'networkidle0' });
  
  const isCloseEventModalDefined = await page.evaluate(() => typeof window.closeEventModal);
  console.log('typeof window.closeEventModal:', isCloseEventModalDefined);

  const isToggleEditModeDefined = await page.evaluate(() => typeof window.toggleEditMode);
  console.log('typeof window.toggleEditMode:', isToggleEditModeDefined);

  await browser.close();
  process.exit(0);
})();
