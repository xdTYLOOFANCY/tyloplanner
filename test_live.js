import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

(async () => {
  const backend = spawn('python3', ['app.py'], { env: { ...process.env, AUTH_PASSWORD: '' }});
  await new Promise(r => setTimeout(r, 2000));

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  console.log("Navigating to /...");
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle0' });
  
  console.log("At dashboard!");
  
  try {
      await page.waitForSelector('#customizeBtn', { timeout: 2000 });
      await page.click("#customizeBtn");
      console.log("Customize button clicked successfully!");
  } catch (e) {
      console.log("Failed to click Customize:", e.message);
  }

  const topEl = await page.evaluate(() => {
      let el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
      return el ? el.tagName + '#' + el.id + '.' + el.className : null;
  });
  console.log("Top element at center:", topEl);

  await page.screenshot({ path: 'test_live.png' });
  console.log("Screenshot saved to test_live.png");

  await browser.close();
  backend.kill();
})();
