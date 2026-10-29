const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8766);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 700 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8766/preview.html?mock=1'); await p.waitForTimeout(2000);
const cards = await p.$$('.card'); for (let i=0;i<cards.length;i++){ await cards[i].$eval(`button[data-s="${['idle','win','tired','stumble'][i%4]}"]`, b=>b.click()); }
await p.waitForTimeout(500); await p.screenshot({ path: 'shots/preview.png' });
// race finish frame
await p.setViewportSize({width:1920,height:1080}); await p.goto('file://' + __dirname + '/race.html'); 
const t=Date.now(); while(!(await p.evaluate(()=>window.done)) && Date.now()-t<40000) await p.waitForTimeout(500);
await p.screenshot({ path: 'shots/r5-finish-states.png' });
console.log('errors', errs); await b.close(); server.close(); })();
