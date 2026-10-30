const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8772);
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const n = process.argv[2] || 40; await p.goto(`http://localhost:8772/barmarbles-preview.html?n=${n}&steps=30&render=0`);
let lastSim = 0; for (let i=0;i<60;i++) { await p.waitForTimeout(3000); const s = await p.evaluate(() => window.__dbg ? window.__dbg() : null); if (!s) continue; if (i%4===0) console.log(JSON.stringify(s)); if (await p.evaluate(()=>window.__done)) { console.log('DONE', await p.textContent('#res'), 'simTime', s.simTime); break; } }
const rs = await p.evaluate(()=>window.__rs||[]); const h={}; rs.forEach(r=>{ const k=Math.floor(r[0]/20)*20; h[k]=(h[k]||0)+1; }); console.log('resets by prog', JSON.stringify(h)); console.log(JSON.stringify(rs.filter((_,i)=>i%6===0).slice(0,30)));
await p.screenshot({ path: 'shots/bm-dbg.png' }); console.log('errors', errs); await b.close(); server.close(); })();
