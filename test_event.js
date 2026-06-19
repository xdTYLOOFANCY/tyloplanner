const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:3008/index.html', { waitUntil: 'networkidle0' });
  
  console.log('Testing openAdd:');
  await page.evaluate(() => window.openAdd('2026-06-17'));
  
  const display = await page.$eval('#eventModal', el => window.getComputedStyle(el).display);
  console.log('eventModal display after openAdd:', display);
  
  console.log('Clicking Cancel button...');
  await page.evaluate(() => window.closeEventModal());
  
  const displayAfter = await page.$eval('#eventModal', el => window.getComputedStyle(el).display);
  console.log('eventModal display after closeEventModal:', displayAfter);
  
  await browser.close();
  process.exit(0);
})();
