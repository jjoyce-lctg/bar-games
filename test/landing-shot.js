const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8780);
(async () => { const b = await chromium.launch(); 
  for (const [w, h, n] of [[1366, 900, 'desktop'], [390, 844, 'mobile']]) { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto('http://localhost:8780/'); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/landing-${n}.png`, fullPage: true }); await p.close(); }
  await b.close(); server.close(); })();
