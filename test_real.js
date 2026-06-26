import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

(async () => {
  const backend = spawn('python3', ['app.py']);
  await new Promise(r => setTimeout(r, 2000));

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle0' });
  
  const html = await page.content();
  if (html.includes('id="loginForm"')) {
     await page.type('#username', 'testuser');
     await page.type('#password', 'testpass');
     await page.click('button[onclick="showRegister()"]'); // Wait, the UI has a register toggle?
     // Actually let's just evaluate the registration endpoint directly
     await page.evaluate(async () => {
         await fetch('/api/register', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({username: 'testuser', password: 'testpass'})
         });
     });
     await page.type('#username', 'testuser');
     await page.type('#password', 'testpass');
     await page.evaluate(() => submitAuth());
     await page.waitForNavigation({ waitUntil: 'networkidle0' });
  }

  console.log("Logged in!");
  
  try {
      await page.click("#customizeBtn", { timeout: 2000 });
      console.log("Customize button clicked successfully!");
  } catch (e) {
      console.log("Failed to click Customize:", e.message);
  }

  const topEl = await page.evaluate(() => {
      let el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
      return el ? el.tagName + '#' + el.id + '.' + el.className : null;
  });
  console.log("Top element at center:", topEl);

  await browser.close();
  backend.kill();
})();
