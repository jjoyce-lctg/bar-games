// Render the shell game with a manual clock to frames, then stitch an mp4.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8781);
(async () => {
  const dir = path.join(__dirname, 'sgframes'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://localhost:8781/shellgame-preview.html?manual=1&pick=3&seed=${process.argv[2] || 7}`); await p.waitForTimeout(800);
  const FPS = 30; let i = 0;
  while (i < FPS * 30) { await p.evaluate((dt) => window.__ctl.advance(dt), 1 / FPS); if (i % 1 === 0) await p.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) }); i++; if (await p.evaluate(() => !!window.__done)) { for (let k = 0; k < FPS; k++) { await p.evaluate((dt) => window.__ctl.advance(dt), 1 / FPS); await p.screenshot({ path: path.join(dir, `f${String(i++).padStart(4, '0')}.png`) }); } break; } }
  console.log('frames', i); await b.close(); server.close();
})();
