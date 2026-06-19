const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:3006/index.html', { waitUntil: 'networkidle0' });
  
  console.log('Testing customizeBtn:');
  await page.click('#customizeBtn');
  const customizerDisplay = await page.$eval('#customizerPanel', el => window.getComputedStyle(el).display);
  console.log('customizerPanel display after click:', customizerDisplay);
  
  await browser.close();
  process.exit(0);
})();
