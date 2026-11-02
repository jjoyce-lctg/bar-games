// mock: race, then R (replay), P (pause), and the phone's prize line + birthday ask
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8804);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const errs = [];
  const sr = await ctx.newPage(); sr.on('pageerror', e => errs.push('SR ' + e.message));
  await sr.goto('http://localhost:8804/showrunner.html?mock=1'); await sr.waitForTimeout(800);
  await sr.fill('#username', 'dj'); await sr.fill('#password', 'dj'); await sr.click('#btnLogin'); await sr.waitForTimeout(800);
  console.log('prize datalist:', await sr.$$eval('#prizeList option', o => o.map(x => x.value)));
  await sr.click('#btnVenue'); await sr.waitForTimeout(1500);
  await sr.keyboard.press('r'); await sr.waitForTimeout(300); console.log('replay before any round: toast =', await sr.$eval('.toast', e => e.textContent).catch(() => 'none'));
  await sr.keyboard.press('p'); await sr.waitForTimeout(500); console.log('paused:', (await sr.textContent('#stageBody')).replace(/\s+/g, ' ').slice(0, 60)); await sr.screenshot({ path: 'shots/sr-pause.png' });
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(800); console.log('back to lobby, code visible:', !!(await sr.$('.code')));
  for (let i = 0; i < 4; i++) { const t = await sr.textContent('.gamesel').catch(() => ''); if (/MASCOT/.test(t || '')) break; await sr.keyboard.press('ArrowDown'); await sr.waitForTimeout(1200); }
  const code = (await sr.textContent('.code')).replace('CODE', '').trim();
  for (const [i, [name, phone]] of [['Jamie Cole', '3125550101'], ['Sam Patel', '3125550102']].entries()) {
    const g = await ctx.newPage({ viewport: { width: 390, height: 844 } }); g.on('pageerror', e => errs.push('ENTRY ' + e.message));
    await g.goto(`http://localhost:8804/entry.html?mock=1&c=${code}&edit=1`); await g.waitForTimeout(600);
    const opts = await g.$$('.opt'); await opts[i].click(); await g.fill('#name', name); await g.fill('#phone', phone); await g.check('#optin'); await g.click('#submit'); await g.waitForTimeout(800);
    if (i === 0) { console.log('bday ask shown:', !!(await g.$('#bday'))); await g.click('#bday .bm[data-m="6"]'); await g.waitForTimeout(300); console.log('after pick:', await g.textContent('#bday')); await g.screenshot({ path: 'shots/entry-extras.png' }); }
    await g.close();
  }
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(400); await sr.keyboard.press('Enter');
  for (let i = 0; i < 40; i++) { await sr.waitForTimeout(1000); if (await sr.$('.results')) break; }
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(600); await sr.keyboard.press('Enter'); await sr.waitForTimeout(1500);
  console.log('lobby again:', !!(await sr.$('.code')));
  await sr.keyboard.press('r'); await sr.waitForTimeout(1200); console.log('replay:', (await sr.textContent('#stageBody')).replace(/\s+/g, ' ').slice(0, 60), '| foot:', (await sr.textContent('#stFootLeft')).trim());
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(1200); console.log('after replay enter -> lobby:', !!(await sr.$('.code')));
  // winner's phone sees prize count on next entry
  const newCode = (await sr.textContent('.code')).replace('CODE', '').trim();
  const st = await sr.evaluate(() => JSON.parse(localStorage.getItem('barGamesMock')).prizes.map(p => p.phone));
  if (!st.length) { console.log('no winner this run, skipping prize line'); console.log('errors:', errs); await b.close(); server.close(); return; }
  const g = await ctx.newPage({ viewport: { width: 390, height: 844 } }); await g.goto(`http://localhost:8804/entry.html?mock=1&c=${newCode}&edit=1`); await g.waitForTimeout(600);
  await (await g.$$('.opt'))[0].click(); await g.fill('#name', 'Winner'); await g.fill('#phone', st[0]); await g.check('#optin'); await g.click('#submit'); await g.waitForTimeout(800);
  console.log('prize line:', await g.$eval('.done a.btn', e => e.textContent).catch(() => 'none'));
  console.log('errors:', errs); await b.close(); server.close();
})();
