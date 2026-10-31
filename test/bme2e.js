const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8797);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const sr = await ctx.newPage(); const errs = []; sr.on('pageerror', e => errs.push('SR ' + e.message));
  await sr.goto('http://localhost:8797/showrunner.html?mock=1'); await sr.waitForTimeout(800);
  await sr.fill('#username', 'dj'); await sr.fill('#password', 'dj'); await sr.click('#btnLogin'); await sr.waitForTimeout(800);
  await sr.evaluate(() => { localStorage.setItem('bg.showrunner', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('bg.showrunner') || '{}'), { gameKey: 'barmarbles' }))); });
  await sr.click('#btnVenue'); await sr.waitForTimeout(1500);
  // cycle to Bar Marbles if needed
  for (let i = 0; i < 3; i++) { const t = await sr.textContent('.gamesel').catch(() => ''); if (/MARBLES/.test(t || '')) break; await sr.keyboard.press('ArrowDown'); await sr.waitForTimeout(1200); }
  const code = (await sr.textContent('.code')).replace('CODE', '').trim(); console.log('round code', code, 'game', await sr.textContent('.gamesel'));
  // three guests
  const guests = [['Jamie Cole', '3125550101', 'c0'], ['Sam Patel', '3125550102', 'c6'], ['Dana Ortiz', '3125550103', 'c9']];
  for (const [name, phone, pick] of guests) {
    const g = await ctx.newPage(); g.on('pageerror', e => errs.push('ENTRY ' + e.message));
    await g.goto(`http://localhost:8797/entry.html?mock=1&c=${code}`); await g.waitForTimeout(700);
    await g.click(`.opt[data-id="${pick}"]`); await g.fill('#name', name); await g.fill('#phone', phone); await g.check('#optin'); await g.click('#submit'); await g.waitForTimeout(900);
    const preds = await g.$$('.pred'); if (preds.length) { await preds[0].click(); await g.waitForTimeout(500); }
    console.log(name, '->', (await g.textContent('#content')).replace(/\s+/g, ' ').slice(0, 160));
    await g.screenshot({ path: `shots/e2e-entry-${pick}.png` }); await g.close();
  }
  await sr.waitForTimeout(3000); await sr.screenshot({ path: 'shots/e2e-landing.png' });
  console.log('field on TV:', (await sr.textContent('#fieldList')).replace(/\s+/g, ' '));
  await sr.keyboard.press('Enter'); await sr.waitForTimeout(500); await sr.keyboard.press('Enter'); // start clock, then race now
  for (let i = 0; i < 400; i++) { await sr.waitForTimeout(2000); if (await sr.$(".bm-final.on")) break; }
  await sr.waitForTimeout(1500); await sr.screenshot({ path: 'shots/e2e-final.png' });
  console.log('final:', (await sr.textContent('.bm-final')).replace(/\s+/g, ' '));
  const st = await sr.evaluate(() => { const s = JSON.parse(localStorage.getItem('barGamesMock')); const r = s.rounds[s.rounds.length - 1]; return { status: r.status, entries: s.entries.filter(e => e.round_id === r.id).map(e => [e.name, e.pick, e.place, e.is_winner, e.predict_ok]), prizes: (s.prizes || []).map(p => p.name) }; });
  console.log(JSON.stringify(st)); console.log('errors', errs);
  await b.close(); server.close();
})();
