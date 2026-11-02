// mock: run a race so there is data, then click through every admin tab and the contact drawer
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8803);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const errs = [];
  const sr = await ctx.newPage(); sr.on('pageerror', e => errs.push('SR ' + e.message));
  await sr.goto('http://localhost:8803/showrunner.html?mock=1'); await sr.waitForTimeout(800);
  await sr.fill('#username', 'dj'); await sr.fill('#password', 'dj'); await sr.click('#btnLogin'); await sr.waitForTimeout(800);
  await sr.click('#btnVenue'); await sr.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) { const t = await sr.textContent('.gamesel').catch(() => ''); if (/MASCOT/.test(t || '')) break; await sr.keyboard.press('ArrowDown'); await sr.waitForTimeout(1200); }
  const code = (await sr.textContent('.code')).replace('CODE', '').trim();
  for (const [i, [name, phone]] of [['Jamie Cole', '3125550101'], ['Sam Patel', '3125550102'], ['Dana Ortiz', '3125550103'], ['Alex Kim', '3125550104']].entries()) {
    const g = await ctx.newPage({ viewport: { width: 390, height: 844 } }); g.on('pageerror', e => errs.push('ENTRY ' + e.message));
    await g.goto(`http://localhost:8803/entry.html?mock=1&c=${code}&edit=1`); await g.waitForTimeout(600);
    const opts = await g.$$('.opt'); await opts[i % opts.length].click(); await g.fill('#name', name); await g.fill('#phone', phone); await g.check('#optin'); await g.click('#submit'); await g.waitForTimeout(600); await g.close();
  }
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(400); await sr.keyboard.press('Enter');
  for (let i = 0; i < 40; i++) { await sr.waitForTimeout(1000); if (await sr.$('.results')) break; }
  await sr.close();
  const a = await ctx.newPage(); a.on('pageerror', e => errs.push('ADMIN ' + e.message)); a.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await a.goto('http://localhost:8803/admin.html?mock=1'); await a.waitForTimeout(600);
  await a.fill('#username', 'admin'); await a.fill('#password', 'admin'); await a.click('#btnLogin'); await a.waitForTimeout(1000);
  const shot = async (n) => a.screenshot({ path: `shots/admin-${n}.png` });
  console.log('dash:', (await a.textContent('#dashStats')).replace(/\s+/g, ' ').slice(0, 160)); await shot('dash');
  for (const t of ['contacts', 'campaigns', 'messages', 'prizes', 'games', 'venues', 'settings', 'users']) {
    await a.click(`.tabs button[data-tab="${t}"]`); await a.waitForTimeout(700);
    if (t === 'contacts') { console.log('contacts rows:', await a.$$eval('#contactsBody tr', r => r.length)); await a.click('#contactsBody tr'); await a.waitForTimeout(600); await shot('contact-drawer'); console.log('drawer:', (await a.textContent('.drawer h2'))); await a.fill('.drawer textarea.notes', 'Loves trivia'); await a.click('.drawer .saveC'); await a.waitForTimeout(400); await a.click('.drawer .close'); await a.waitForTimeout(200); await a.click('#contactSub button[data-s="entries"]'); await a.waitForTimeout(500); console.log('entries rows:', await a.$$eval('#entriesBody tr', r => r.length)); }
    if (t === 'campaigns') { await a.selectOption('#kTemplate', '0'); await a.fill('#kName', 'Test blast'); await a.waitForTimeout(300); console.log('count:', await a.textContent('#kCount'), '| audience:', await a.textContent('#kAudience')); await a.click('#btnSaveCamp'); await a.waitForTimeout(500); console.log('campaign rows:', await a.$$eval('#campBody tr', r => r.length)); await a.click('#btnSendCamp'); await a.waitForTimeout(200); await a.click('#btnSendCamp'); await a.waitForTimeout(500); console.log('sent:', (await a.textContent('#campMsg')).trim()); }
    if (t === 'prizes') { await a.click('#prizeSub button[data-s="catalog"]'); await a.waitForTimeout(400); console.log('catalog rows:', await a.$$eval('#catBody tr', r => r.length)); }
    if (t === 'games') { console.log('game cards:', await a.$$eval('#gamesSetup .game-card', r => r.length)); await a.click('#gameSub button[data-s="racers"]'); await a.waitForTimeout(400); console.log('racer cards:', await a.$$eval('#racersBody [data-game]', r => r.length)); await a.fill('#racersBody [data-game] .oFrom', '10-01'); await a.fill('#racersBody [data-game] .oTo', '11-30'); await a.click('#racersBody [data-game] .oSave'); await a.waitForTimeout(400); console.log('season label:', await a.textContent('#racersBody [data-game] .muted')); await a.click('#gameSub button[data-s="board"]'); await a.waitForTimeout(500); }
    if (t === 'settings') { console.log('settings rows:', await a.$$eval('.set-row', r => r.length)); await a.selectOption('[data-k="sms_test_mode"]', 'false'); await a.click('.set-row .save'); await a.waitForTimeout(300); console.log('banner hidden:', await a.$eval('#testBanner', e => e.classList.contains('hidden'))); }
    await shot(t);
  }
  console.log('errors:', errs);
  await b.close(); server.close();
})();
