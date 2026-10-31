// Headless batch: N races of M marbles, in parallel pages, turbo physics, no rendering. Prints fairness + timing stats, writes batch-results.json.
// usage: NODE_PATH=$(npm root -g) node bmbatch.js [races=200] [marbles=40] [parallel=6]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8790);
const RACES = +(process.argv[2] || 200), N = +(process.argv[3] || 40), PAR = +(process.argv[4] || 2);
const STORE = path.join(__dirname, 'batch-results.json'); // accumulates across runs (same marble count); delete it to start over
(async () => {
  if (RACES === 0) { const results = JSON.parse(fs.readFileSync(STORE)).races; summarize(results); return; }
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const prior = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE)).races.filter((r) => r.n === N) : []; const results = [...prior]; let next = 0; const t0 = Date.now();
  async function worker() {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } });
    while (next < RACES) { const k = next++;
      await p.goto(`http://localhost:8790/barmarbles-preview.html?n=${N}&steps=240&render=0&turbo=1`);
      let r = null; for (let i = 0; i < 600; i++) { await p.waitForTimeout(250); r = await p.evaluate(() => window.__result || null); if (r) break; }
      if (r) { results.push(r); fs.writeFileSync(STORE, JSON.stringify({ races: results }, null, 1)); console.log(`${results.length} races stored (${results.length - prior.length} new), ${((Date.now() - t0) / 1000).toFixed(0)}s`); } else console.log('race', k, 'timed out');
    }
    await p.close();
  }
  await Promise.all(Array.from({ length: PAR }, worker));
  await b.close(); server.close();
  summarize(results);
})();
function summarize(results) {
  const R = results.length; const bySlot = {}, byRow = {}, byCol = {}, byColor = {}; let top5BySlot = {};
  results.forEach((r) => { const w = r.order[0]; if (!w) return; bySlot[w.slot] = (bySlot[w.slot] || 0) + 1; const row = Math.floor(w.slot / 4), col = w.slot % 4; byRow[row] = (byRow[row] || 0) + 1; byCol[col] = (byCol[col] || 0) + 1; byColor[w.colorIdx] = (byColor[w.colorIdx] || 0) + 1; r.order.slice(0, 5).forEach((m) => { top5BySlot[m.slot] = (top5BySlot[m.slot] || 0) + 1; }); });
  const q = (arr, f) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor((a.length - 1) * f)]; };
  const wt = results.map((r) => r.winnerTime), t5 = results.map((r) => r.finishTimes[4] ?? r.simTime), resets = results.map((r) => r.resets), ledge = results.map((r) => r.offLedge);
  // plinko: rank correlation between entry order and exit order (1 = pure procession, 0 = no relation)
  const spearman = (pairs) => { const n = pairs.length; if (n < 5) return null; const rank = (vals) => { const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(n); idx.forEach(([_, i], k) => { r[i] = k; }); return r; }; const ra = rank(pairs.map((p) => p[0])), rb = rank(pairs.map((p) => p[1])); let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2; return 1 - 6 * d2 / (n * (n * n - 1)); };
  const rho = results.map((r) => spearman(r.plinko)).filter((x) => x !== null);
  const rows = Math.ceil(N / 4); const expSlot = R / N, expRow = R / rows, expCol = R / 4;
  const chi = (counts, cats, exp) => { let c = 0; for (let i = 0; i < cats; i++) c += ((counts[i] || 0) - exp) ** 2 / exp; return c; };
  const fmt = (o, cats) => Array.from({ length: cats }, (_, i) => o[i] || 0).join(' ');
  const out = { races: R, marbles: N, winnerTime: { min: q(wt, 0), p25: q(wt, .25), median: q(wt, .5), p75: q(wt, .75), max: q(wt, 1) }, fifthTime: { median: q(t5, .5), max: q(t5, 1) }, resetsPerRace: { median: q(resets, .5), max: q(resets, 1) }, ledgeKnockoffsPerRace: { median: q(ledge, .5), max: q(ledge, 1) }, plinkoOrderRho: { median: q(rho, .5), p25: q(rho, .25), p75: q(rho, .75) }, winsByRow: fmt(byRow, rows), winsByCol: fmt(byCol, 4), winsByColor: fmt(byColor, 16), winsBySlot: fmt(bySlot, N), chiRow: +chi(byRow, rows, expRow).toFixed(1), chiCol: +chi(byCol, 4, expCol).toFixed(1), chiSlot: +chi(bySlot, N, expSlot).toFixed(1) };
  fs.writeFileSync(STORE, JSON.stringify({ summary: out, races: results }, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
