const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8771);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8771/rollcall-preview.html');
for (const t of [3,8,15,25]) { await p.waitForTimeout(t===3?3000:t===8?5000:t===15?7000:10000); await p.screenshot({ path: `shots/mb-${t}s.png` }); }
const t=Date.now(); while(!(await p.evaluate(()=>window.__done)) && Date.now()-t<90000) await p.waitForTimeout(500);
await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/mb-finish.png' }); console.log('done flag', await p.evaluate(()=>window.__done));
console.log(await p.textContent('#res'), 'errors', errs); await b.close(); server.close(); })();
