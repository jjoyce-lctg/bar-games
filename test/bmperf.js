// Wall-clock fps on the software renderer (SwiftShader), full vs lite, 20 marbles, 1280x720.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8776);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const quality of (process.argv[2] || 'full,lite').split(',')) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto(`http://localhost:8776/barmarbles-preview.html?n=20&steps=4&quality=${quality}&stats=1`);
    const rows = [];
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(2500); const f = await p.evaluate(() => window.__fps); const d = await p.evaluate(() => window.__dbg()); if (f) rows.push({ sim: +d.simTime.toFixed(0), fps: +f.fps.toFixed(1), frame: +f.frame.toFixed(1), js: +f.js.toFixed(1), phys: +f.phys.toFixed(1) }); }
    console.log(quality, JSON.stringify(rows));
    await p.close();
  }
  await b.close(); server.close();
})();
