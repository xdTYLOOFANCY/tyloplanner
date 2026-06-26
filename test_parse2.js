import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';

(async () => {
  const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head>
                <script type="module" src="static/app.js"></script>
            </head><body></body></html>`);
        return;
    }
    const ext = path.extname(filePath);
    let contentType = 'text/plain';
    if (ext === '.js') contentType = 'application/javascript';
    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    } catch (e) {
        console.log("SERVER 404:", filePath);
        res.writeHead(404);
        res.end('Not found: ' + filePath);
    }
  });
  server.listen(8082);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle0' });
  await browser.close();
  server.close();
})();
