import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle0' });
  
  // Wait for a button and click it
  console.log("Clicking customize button...");
  try {
    await page.click('#customizeBtn');
  } catch (e) {
    console.error("Click error:", e);
  }
  
  console.log("Clicking FAB...");
  try {
    await page.click('#fabBtn');
  } catch (e) {
    console.error("Click error:", e);
  }

  // Evaluate if window methods are defined
  const methods = await page.evaluate(() => {
    return {
      toggleEditMode: typeof window.toggleEditMode,
      handleFabClick: typeof window.handleFabClick,
      delRow: typeof window.delRow
    };
  });
  console.log("Window methods:", methods);

  await browser.close();
})();
