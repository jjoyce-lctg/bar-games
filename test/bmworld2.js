const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8775);
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:8775/barmarbles-preview.html?n=24&steps=40&turbo=1');
const want = [50]; let k = 0;
while (k < want.length) { await p.waitForTimeout(500); const s = await p.evaluate(() => window.__dbg()); if (s.simTime >= want[k]) { await p.screenshot({ path: `shots/bm-world${want[k]}.png` }); console.log(want[k], await p.evaluate(()=>window.__shot && window.__shot())); k++; } if (await p.evaluate(()=>window.__done)) { await p.waitForTimeout(3000); await p.screenshot({ path: `shots/bm-world-final.png` }); break; } }
await b.close(); server.close(); })();
