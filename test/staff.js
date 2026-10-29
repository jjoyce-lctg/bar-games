const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8767);
const B = 'http://localhost:8767';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const errs = [];
  // seed: run a race as dj with mock state, prizes valid immediately for the test
  const tv = await ctx.newPage(); tv.on('pageerror', e => errs.push('tv ' + e.message));
  await tv.goto(B + '/showrunner.html?mock=1'); await tv.evaluate(() => { localStorage.removeItem('barGamesMock'); window.__mockNoWait = true; });
  await tv.reload(); await tv.evaluate(() => { window.__mockNoWait = true; });
  await tv.fill('#username', 'dj'); await tv.fill('#password', 'dj'); await tv.click('#btnLogin'); await tv.waitForSelector('#viewVenue:not(.hidden)'); await tv.fill('#prize', 'a free round'); await tv.click('#btnVenue'); await tv.waitForSelector('#stage.on .ready');
  await tv.keyboard.press('Enter'); await tv.waitForSelector('#stage.on .qr-wrap svg');
  const code = (await tv.textContent('.signup .code')).replace('CODE', '').trim();
  for (const [n, ph, pick] of [['Marcus Lee', '3125551000', 'hotdog'], ['Dana Ortiz', '3125551001', 'beer'], ['Sam Patel', '3125551002', 'pretzel'], ['Kelly Nguyen', '3125551003', 'pizza']]) {
    const p = await ctx.newPage(); await p.goto(`${B}/entry.html?c=${code}&mock=1`); await p.waitForSelector('.opt'); await p.click(`.opt[data-id="${pick}"]`); await p.fill('#name', n); await p.fill('#phone', ph); await p.check('#optin'); await p.click('#submit'); await p.waitForSelector('.done'); await p.close(); }
  await tv.keyboard.press('Enter'); await tv.waitForSelector('.results', { timeout: 60000 });
  const winnerName = (await tv.$$eval('.results .names span', s => s.map(x => x.textContent)))[0];
  const winPick = (await tv.textContent('.results h1')).trim();
  console.log('winner:', winPick, winnerName);
  const phones = { 'Marcus L.': '3125551000', 'Dana O.': '3125551001', 'Sam P.': '3125551002', 'Kelly N.': '3125551003' };
  // staff page
  const st = await ctx.newPage(); st.on('pageerror', e => errs.push('staff ' + e.message));
  await st.goto(B + '/staff.html?mock=1'); await st.evaluate(() => { const s = JSON.parse(localStorage.getItem('barGamesMock')); s.session = null; localStorage.setItem('barGamesMock', JSON.stringify(s)); }); await st.reload();
  await st.fill('#username', 'dj'); await st.fill('#password', 'dj'); await st.click('#btnLogin'); await st.waitForTimeout(400); console.log('dj blocked:', (await st.textContent('#loginError')).trim());
  await st.fill('#username', 'manager'); await st.fill('#password', 'manager'); await st.click('#btnLogin'); await st.waitForSelector('#viewVenue:not(.hidden)'); await st.click('#btnVenue');
  await st.fill('#phone', phones[winnerName]); await st.click('#btnLookup'); await st.waitForSelector('.prize'); await st.screenshot({ path: 'shots/staff-lookup.png' });
  console.log('status:', await st.textContent('.prize .status'));
  await st.click('.prize .redeem'); await st.click('.prize .redeem'); await st.waitForSelector('.done'); await st.screenshot({ path: 'shots/staff-redeemed.png' });
  await st.fill('#phone', phones[winnerName]); await st.click('#btnLookup'); await st.waitForSelector('.prize'); console.log('second lookup:', await st.textContent('.prize .status'));
  await st.fill('#phone', '3125559999'); await st.click('#btnLookup'); await st.waitForTimeout(300); console.log('unknown:', (await st.textContent('#results')).slice(0, 40));
  // admin prizes tab
  const ad = await ctx.newPage(); ad.on('pageerror', e => errs.push('admin ' + e.message));
  await ad.goto(B + '/admin.html?mock=1'); await ad.evaluate(() => { const s = JSON.parse(localStorage.getItem('barGamesMock')); s.session = null; localStorage.setItem('barGamesMock', JSON.stringify(s)); }); await ad.reload();
  await ad.fill('#username', 'admin'); await ad.fill('#password', 'admin'); await ad.click('#btnLogin'); await ad.waitForSelector('#viewAdmin:not(.hidden)');
  await ad.click('.tabs button[data-tab="prizes"]'); await ad.waitForTimeout(400); await ad.screenshot({ path: 'shots/admin-prizes.png' });
  console.log('prize rows:', await ad.$$eval('#prizesBody tr[data-id]', r => r.length), 'errors:', errs);
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
