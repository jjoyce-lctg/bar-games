// Shell game end to end in the mock backend: TV + three phones in one browser; phones get the live pick window and lock in; results on both ends.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8799);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const sr = await ctx.newPage(); const errs = []; sr.on('pageerror', e => errs.push('SR ' + e.message));
  await sr.goto('http://localhost:8799/showrunner.html?mock=1'); await sr.waitForTimeout(800);
  await sr.fill('#username', 'dj'); await sr.fill('#password', 'dj'); await sr.click('#btnLogin'); await sr.waitForTimeout(800);
  await sr.click('#btnVenue'); await sr.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) { const t = await sr.textContent('.gamesel').catch(() => ''); if (/SHELL/.test(t || '')) break; await sr.keyboard.press('ArrowDown'); await sr.waitForTimeout(1200); }
  const code = (await sr.textContent('.code')).replace('CODE', '').trim(); console.log('round', code, await sr.textContent('.gamesel'));
  const guests = [['Jamie Cole', '3125550101'], ['Sam Patel', '3125550102'], ['Dana Ortiz', '3125550103']]; const pages = [];
  for (const [name, phone] of guests) {
    const g = await ctx.newPage({ viewport: { width: 390, height: 844 } }); g.on('pageerror', e => errs.push('ENTRY ' + e.message));
    await g.goto(`http://localhost:8799/entry.html?mock=1&c=${code}&edit=1`); await g.waitForTimeout(700);
    await g.fill('#name', name); await g.fill('#phone', phone); await g.check('#optin'); await g.click('#submit'); await g.waitForTimeout(900);
    console.log(name, '->', (await g.textContent('#content')).replace(/\s+/g, ' ').slice(0, 120)); pages.push(g);
  }
  await pages[0].screenshot({ path: 'shots/sg-phone-wait.png' });
  await sr.waitForTimeout(3000); await sr.screenshot({ path: 'shots/sg-landing.png' });
  console.log('field on TV:', (await sr.textContent('#fieldList')).replace(/\s+/g, ' '));
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(500); await sr.keyboard.press('Enter');
  // wait for the pick window on the phones, measure how long after the TV opened it
  const tOpen = Date.now(); let seen = null;
  for (let i = 0; i < 400; i++) { await pages[0].waitForTimeout(100); if (await pages[0].$('.opt.cup')) { seen = Date.now(); break; } }
  const tvChoose = await sr.evaluate(() => getComputedStyle(document.querySelector('.sg-choose')).opacity);
  console.log('phone saw pick window', seen ? 'yes' : 'NO', 'tv choose overlay opacity', tvChoose);
  await sr.screenshot({ path: 'shots/sg-tv-choose.png' }); await pages[0].screenshot({ path: 'shots/sg-phone-choose.png' });
  // phones pick 1, 2, 3; the first changes its mind
  await pages[0].click('.opt.cup[data-id="c1"]'); await pages[1].click('.opt.cup[data-id="c2"]'); await pages[2].click('.opt.cup[data-id="c3"]'); await pages[0].waitForTimeout(400); await pages[0].click('.opt.cup[data-id="c2"]'); await pages[0].waitForTimeout(500);
  console.log('phone0 msg:', (await pages[0].textContent('#pickMsg')).trim());
  for (let i = 0; i < 40; i++) { await sr.waitForTimeout(1000); if (await sr.$('.results')) break; }
  await sr.waitForTimeout(1500); await sr.screenshot({ path: 'shots/sg-tv-results.png' });
  console.log('TV results:', (await sr.textContent('.results')).replace(/\s+/g, ' ').slice(0, 200));
  await pages[0].waitForTimeout(1500); await pages[0].screenshot({ path: 'shots/sg-phone-result.png' });
  for (const [i, g] of pages.entries()) console.log('phone', i, (await g.textContent('#content')).replace(/\s+/g, ' ').slice(0, 120));
  const st = await sr.evaluate(() => { const s = JSON.parse(localStorage.getItem('barGamesMock')); const r = s.rounds[s.rounds.length - 1]; return { status: r.status, winning_pick: r.winning_pick, entries: s.entries.filter(e => e.round_id === r.id).map(e => [e.name, e.pick, e.is_winner]) }; });
  console.log(JSON.stringify(st));
  // express entry: new round, same phone, zero taps
  await sr.keyboard.press('Escape'); await sr.waitForTimeout(2500);
  const code2 = (await sr.textContent('.code').catch(() => '')).replace('CODE', '').trim(); console.log('new round', code2, await sr.textContent('.gamesel').catch(() => ''));
  if (code2) { const g = pages[0]; await g.goto(`http://localhost:8799/entry.html?mock=1&c=${code2}`); await g.waitForTimeout(1200); console.log('express shell:', (await g.textContent('#content')).replace(/\s+/g, ' ').slice(0, 100)); await g.screenshot({ path: 'shots/sg-express.png' }); }
  // and the mascot race: one tap
  for (let i = 0; i < 4; i++) { const t = await sr.textContent('.gamesel').catch(() => ''); if (/MASCOT/.test(t || '')) break; await sr.keyboard.press('ArrowDown'); await sr.waitForTimeout(1500); }
  const code3 = (await sr.textContent('.code').catch(() => '')).replace('CODE', '').trim(); console.log('race round', code3, await sr.textContent('.gamesel').catch(() => ''));
  if (code3) { const g = pages[1]; await g.goto(`http://localhost:8799/entry.html?mock=1&c=${code3}`); await g.waitForTimeout(900); await g.screenshot({ path: 'shots/race-express-pick.png' }); const first = await g.$('.opt'); await first.click(); await g.waitForTimeout(900); console.log('express race:', (await g.textContent('#content')).replace(/\s+/g, ' ').slice(0, 100)); await g.screenshot({ path: 'shots/race-express-in.png' }); }
  console.log('errors', errs);
  await b.close(); server.close();
})();
