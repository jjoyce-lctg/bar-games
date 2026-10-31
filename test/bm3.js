const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8798);
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (let k = 0; k < +(process.argv[2] || 6); k++) { const p = await b.newPage();
    await p.goto(`http://localhost:8798/barmarbles-preview.html?n=${process.argv[3] || 3}&steps=240&render=0&turbo=1`);
    let r = null; for (let i = 0; i < 240; i++) { await p.waitForTimeout(250); r = await p.evaluate(() => window.__result || null); if (r) break; }
    console.log(r ? JSON.stringify({ fin: r.finishTimes, stuck: r.stuck }) : 'timeout'); await p.close(); }
  await b.close(); server.close(); })();
