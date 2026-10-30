const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8774);
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:8774/barmarbles-preview.html?n=40&steps=30`);
for (let i=0;i<30;i++) { await p.waitForTimeout(3000); const s = await p.evaluate(() => window.__dbg ? window.__dbg() : null); if (s && s.simTime > 60) break; }
const out = await p.evaluate(()=>{ const t=window.__track; const sm=[]; for(let i=370;i<=392;i+=2){const s=t.samples[i]; sm.push([i,+s.x.toFixed(1),+s.y.toFixed(1),+s.z.toFixed(1)]);} const ms=window.__marbles.map(m=>{const t=m.body.translation(); const v=m.body.linvel(); return [m.prog,+t.x.toFixed(1),+t.y.toFixed(1),+t.z.toFixed(1),+Math.hypot(v.x,v.y,v.z).toFixed(2)];}); return {sm, ms}; });
console.log(JSON.stringify(out.sm)); console.log(JSON.stringify(out.ms));
await p.evaluate(() => { window.__cam = { pos: [-2, 60, -4], look: [8, 41, -14] }; }); await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/bm-jam.png' });
await b.close(); server.close(); })();
