import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';

(async () => {
  const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    window.onerror = function(msg, url, line, col, error) {
                        console.log("WINDOW ERROR:", msg, line, col, error ? error.stack : "");
                    };
                    window.addEventListener('unhandledrejection', function(event) {
                        console.log("UNHANDLED PROMISE REJECTION:", event.reason);
                    });
                </script>
                <!-- Include alpine to avoid its missing error -->
                <script defer src="static/js/alpine.min.js"></script>
                <script type="module" src="static/app.js"></script>
            </head>
            <body></body>
            </html>
        `);
        return;
    }
    
    // Serve static files
    const ext = path.extname(filePath);
    let contentType = 'text/plain';
    if (ext === '.js') contentType = 'application/javascript';
    
    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    } catch (e) {
        res.writeHead(404);
        res.end('Not found: ' + filePath);
    }
  });
  
  server.listen(8081);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  
  await page.goto('http://127.0.0.1:8081/', { waitUntil: 'networkidle0' });
  
  const hasToggleEditMode = await page.evaluate(() => typeof window.toggleEditMode === 'function');
  console.log("Has window.toggleEditMode?", hasToggleEditMode);

  await browser.close();
  server.close();
})();
