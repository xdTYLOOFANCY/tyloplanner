import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  try {
    await page.goto('http://127.0.0.1:8000/');
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.error('Failed to load page:', e);
  }
  
  await browser.close();
})();
