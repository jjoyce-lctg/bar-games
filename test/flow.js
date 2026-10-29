const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(8765);
const B = 'http://localhost:8765';
const out = path.resolve(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  const errors = [];
  tv.on('pageerror', (e) => errors.push('TV: ' + e.message));
  tv.on('console', (m) => { if (m.type() === 'error') errors.push('TV console: ' + m.text()); });

  await tv.goto(B + '/showrunner.html?mock=1');
  await tv.screenshot({ path: out + '/01-login.png' });
  await tv.fill('#username', 'dj'); await tv.fill('#password', 'dj'); await tv.click('#btnLogin');
  await tv.waitForSelector('#viewVenue:not(.hidden)');
  await tv.selectOption('#venueSelect', { label: 'The Reveler' }); await tv.fill('#prize', 'a free round'); await tv.click('#btnVenue');
  await tv.waitForSelector('#stage.on .ready'); await tv.waitForTimeout(800);
  await tv.screenshot({ path: out + '/02-ready.png' });
  await tv.keyboard.press('Enter');
  await tv.waitForSelector('#stage.on .qr-wrap svg');
  const code = (await tv.textContent('.signup .code')).replace('CODE', '').trim();
  console.log('round code', code);
  await tv.screenshot({ path: out + '/03-lobby.png' });

  // guests enter on phones (same localStorage origin, so mock state is shared)
  const picks = ['hotdog', 'beer', 'pretzel', 'pizza', 'beer', 'beer', 'hotdog'];
  for (let i = 0; i < picks.length; i++) {
    const ph = await ctx.newPage({ viewport: { width: 390, height: 844 } });
    await ph.setViewportSize({ width: 390, height: 844 });
    ph.on('pageerror', (e) => errors.push('Phone: ' + e.message));
    await ph.goto(`${B}/entry.html?c=${code}&mock=1`);
    await ph.waitForSelector('.opt');
    if (i === 0) await ph.screenshot({ path: out + '/04-entry.png', fullPage: true });
    await ph.click(`.opt[data-id="${picks[i]}"]`);
    await ph.fill('#name', ['Marcus Lee', 'Dana Ortiz', 'Sam Patel', 'Kelly Nguyen', 'Jordan Fox', 'Alex Kim', 'Taylor Reed'][i]);
    await ph.fill('#phone', `312555${String(1000 + i).padStart(4, '0')}`);
    if (i === 1) { await ph.click('#submit'); await ph.waitForSelector('#err:not(.hidden)'); console.log('validation:', await ph.textContent('#err')); }
    await ph.check('#optin'); await ph.click('#submit');
    await ph.waitForSelector('.done');
    if (i === 0) await ph.screenshot({ path: out + '/05-entered.png', fullPage: true });
    await ph.close();
  }
  await tv.waitForTimeout(3000);
  console.log('count shown:', await tv.textContent('#stCount'));
  await tv.screenshot({ path: out + '/06-lobby-filled.png' });

  await tv.keyboard.press('Enter');
  await tv.waitForTimeout(9000);
  await tv.screenshot({ path: out + '/07-race.png' });
  await tv.waitForSelector('.results', { timeout: 45000 });
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: out + '/08-results.png' });
  console.log('result:', (await tv.textContent('.results h1')).trim(), '|', (await tv.textContent('.results p')).trim());
  await tv.keyboard.press('Enter');
  await tv.waitForSelector('.board'); await tv.waitForTimeout(500);
  await tv.screenshot({ path: out + '/09-board.png' });
  console.log('board rows:', await tv.$$eval('.board tr', r => r.length));
  await tv.keyboard.press('Enter'); await tv.waitForSelector('.ready');

  // admin
  const ad = await ctx.newPage(); ad.on('pageerror', (e) => errors.push('Admin: ' + e.message));
  await ad.goto(B + '/admin.html?mock=1');
  await ad.evaluate(() => { const s = JSON.parse(localStorage.getItem('barGamesMock')); s.session = null; localStorage.setItem('barGamesMock', JSON.stringify(s)); });
  await ad.reload();
  await ad.fill('#username', 'admin'); await ad.fill('#password', 'admin'); await ad.click('#btnLogin');
  await ad.waitForSelector('#viewAdmin:not(.hidden)');
  await ad.waitForTimeout(500);
  await ad.screenshot({ path: out + '/10-admin-entries.png' });
  await ad.check('#fWinners'); await ad.click('#btnFilter'); await ad.waitForTimeout(300);
  console.log('winner rows:', await ad.$$eval('#entriesBody tr[data-id]', (r) => r.length));
  await ad.click('.tabs button[data-tab="contacts"]'); await ad.waitForTimeout(400);
  await ad.screenshot({ path: out + '/11-admin-contacts.png' });
  await ad.click('.tabs button[data-tab="venues"]'); await ad.waitForTimeout(300);
  await ad.screenshot({ path: out + '/12-admin-venues.png' });
  await ad.click('.tabs button[data-tab="racers"]'); await ad.waitForTimeout(300);
  await ad.screenshot({ path: out + '/12b-admin-racers.png' });
  await ad.click('.tabs button[data-tab="users"]'); await ad.waitForTimeout(300);
  await ad.fill('#nuUser', 'dj.marcus'); await ad.fill('#nuPass', 'password123'); await ad.click('#btnAddUser'); await ad.waitForTimeout(300);
  console.log('user msg:', (await ad.textContent('#userMsg')).trim());
  await ad.screenshot({ path: out + '/13-admin-users.png' });

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
