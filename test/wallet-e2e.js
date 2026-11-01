// mock: play a mascot race with 2 guests, one wins, then open the wallet by code and by token
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8802);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const errs = [];
  const sr = await ctx.newPage(); sr.on('pageerror', e => errs.push('SR ' + e.message));
  await sr.goto('http://localhost:8802/showrunner.html?mock=1'); await sr.waitForTimeout(800);
  await sr.fill('#username', 'dj'); await sr.fill('#password', 'dj'); await sr.click('#btnLogin'); await sr.waitForTimeout(800);
  await sr.click('#btnVenue'); await sr.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) { const t = await sr.textContent('.gamesel').catch(() => ''); if (/MASCOT/.test(t || '')) break; await sr.keyboard.press('ArrowDown'); await sr.waitForTimeout(1200); }
  const code = (await sr.textContent('.code')).replace('CODE', '').trim();
  const picks = ['hotdog', 'beer', 'pretzel', 'pizza'];
  for (const [i, [name, phone]] of [['Jamie Cole', '3125550101'], ['Sam Patel', '3125550102'], ['Dana Ortiz', '3125550103'], ['Alex Kim', '3125550104']].entries()) {
    const g = await ctx.newPage({ viewport: { width: 390, height: 844 } }); g.on('pageerror', e => errs.push('ENTRY ' + e.message));
    await g.goto(`http://localhost:8802/entry.html?mock=1&c=${code}&edit=1`); await g.waitForTimeout(600);
    const opts = await g.$$('.opt'); await opts[i % opts.length].click(); await g.fill('#name', name); await g.fill('#phone', phone); await g.check('#optin'); await g.click('#submit'); await g.waitForTimeout(600); await g.close();
  }
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(400); await sr.keyboard.press('Enter');
  for (let i = 0; i < 40; i++) { await sr.waitForTimeout(1000); if (await sr.$('.results')) break; }
  const res = (await sr.textContent('.results')).replace(/\s+/g, ' '); console.log('results:', res.slice(0, 120));
  const st = await sr.evaluate(() => { const s = JSON.parse(localStorage.getItem('barGamesMock')); return { prizes: s.prizes.map(p => [p.name, p.phone, p.prize]) }; }); console.log(JSON.stringify(st));
  const winnerPhone = st.prizes[0] ? st.prizes[0][1] : '3125550101';
  // wallet by code
  const w = await ctx.newPage({ viewport: { width: 390, height: 844 } }); w.on('pageerror', e => errs.push('WALLET ' + e.message));
  await w.goto('http://localhost:8802/prizes.html?mock=1&edit=1'); await w.waitForTimeout(500);
  await w.fill('#phone', winnerPhone); await w.click('#send'); await w.waitForTimeout(400); await w.screenshot({ path: 'shots/wallet-code.png' });
  await w.fill('#code', '1234'); await w.waitForTimeout(800);
  console.log('wallet:', (await w.textContent('#content')).replace(/\s+/g, ' ').slice(0, 220)); await w.screenshot({ path: 'shots/wallet.png', fullPage: true });
  // by token link
  await w.goto('http://localhost:8802/prizes.html?mock=1&t=w' + winnerPhone); await w.waitForTimeout(600);
  console.log('by link:', (await w.textContent('#content')).replace(/\s+/g, ' ').slice(0, 80));
  // a non-winner
  await w.goto('http://localhost:8802/prizes.html?mock=1&t=w3125550199'); await w.waitForTimeout(600); console.log('bad link:', (await w.textContent('#content')).replace(/\s+/g, ' ').slice(0, 80));
  console.log('errors', errs); await b.close(); server.close();
})();
