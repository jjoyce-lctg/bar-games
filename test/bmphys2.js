const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8779);
const timeStep = () => { const w = window.__world; w.step(); const t = performance.now(); for (let i = 0; i < 10; i++) w.step(); return +((performance.now() - t) / 10).toFixed(2); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`http://localhost:8779/barmarbles-preview.html?n=20&steps=4&turbo=1&render=0&stats=1`);
  for (const target of [10, 28]) {
    while ((await p.evaluate(() => window.__dbg().simTime)) < target) await p.waitForTimeout(300);
    await p.evaluate(() => { window.__ctlGet().stop(); });
    const d = await p.evaluate(() => window.__dbg());
    const parts = await p.evaluate(() => window.__marbles.map(m => { let acc = 0, i = 0; for (const n of window.__track.parts.map(p => p.samples.length)) { if (m.prog < acc + n) break; acc += n; i++; } return i; }));
    const hist = {}; parts.forEach(i => hist[i] = (hist[i] || 0) + 1);
    const base = await p.evaluate(timeStep);
    const tris = await p.evaluate(() => window.__track.parts.map(p => p.indices.length / 3));
    console.log(`sim ${d.simTime}: step ${base} ms  marbles by part ${JSON.stringify(hist)}  tris/part ${JSON.stringify(tris)}`);
    for (const kind of ['skin', 'wall']) { const t = await p.evaluate((kind) => { const w = window.__world; const saved = window.__colliders[kind]; saved.forEach(c => c.setEnabled(false)); const r = (() => { w.step(); const t = performance.now(); for (let i = 0; i < 10; i++) w.step(); return +((performance.now() - t) / 10).toFixed(2); })(); saved.forEach(c => c.setEnabled(true)); return r; }, kind); console.log(`  without ${kind}: ${t} ms`); }
    const nc = await p.evaluate(() => { const w = window.__world; const ms = window.__marbles; ms.forEach(m => m.body.enableCcd(false)); w.step(); const t = performance.now(); for (let i = 0; i < 10; i++) w.step(); const r = +((performance.now() - t) / 10).toFixed(2); ms.forEach(m => m.body.enableCcd(true)); return r; }); console.log(`  without CCD: ${nc} ms`);
    const it = await p.evaluate(() => { const w = window.__world; const ip = w.integrationParameters; const old = ip.numSolverIterations; ip.numSolverIterations = 2; w.step(); const t = performance.now(); for (let i = 0; i < 10; i++) w.step(); const r = +((performance.now() - t) / 10).toFixed(2); ip.numSolverIterations = old; return [old, r]; }); console.log(`  solver iterations ${it[0]} -> 2: ${it[1]} ms`);
    const bb = await p.evaluate(() => { const w = window.__world; const ms = window.__marbles; ms.forEach(m => m.body.setEnabled(false)); ms[0].body.setEnabled(true); w.step(); const t = performance.now(); for (let i = 0; i < 10; i++) w.step(); const r = +((performance.now() - t) / 10).toFixed(2); ms.forEach(m => m.body.setEnabled(true)); return r; }); console.log(`  with 1 marble only: ${bb} ms`);
    await p.evaluate(() => {  });
    if (target === 10) { await p.reload(); await p.goto(`http://localhost:8779/barmarbles-preview.html?n=20&steps=4&turbo=1&render=0&stats=1`); }
  }
  await b.close(); server.close();
})();
