const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8778);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`http://localhost:8778/barmarbles-preview.html?n=${process.argv[2]||20}&steps=4&turbo=1&render=0&stats=1`);
  const rows = [];
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(1000); const f = await p.evaluate(() => window.__fps); const d = await p.evaluate(() => window.__dbg()); if (f) rows.push(`${d.simTime}s lead=${d.lead} med=${d.median} step=${(f.phys/8).toFixed(2)}ms`); if (await p.evaluate(() => window.__done)) break; }
  console.log(rows.join('\n'));
  await b.close(); server.close();
})();
