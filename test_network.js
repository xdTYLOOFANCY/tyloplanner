import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

(async () => {
  const backend = spawn('python3', ['app.py'], { env: { ...process.env, AUTH_PASSWORD: '' }});
  await new Promise(r => setTimeout(r, 2000));

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('response', response => {
    if (!response.ok()) {
      console.log('FAILED REQUEST:', response.status(), response.url());
    }
  });
  
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle0' });
  await browser.close();
  backend.kill();
})();
