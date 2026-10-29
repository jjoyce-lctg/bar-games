const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
for (const st of ['photo','photo','comeback','runaway','photo']) { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + __dirname + '/race.html?style=' + st);
  await p.evaluate(() => { window.__bad = []; window.__last = {}; (function poll(){ if (window.__race) window.__race.forEach(r => { const prev = window.__last[r.id]; if (prev !== undefined && r.p < prev - 0.0001) window.__bad.push([r.id, prev.toFixed(4), r.p.toFixed(4)]); window.__last[r.id] = r.p; }); if (!window.done) requestAnimationFrame(poll); })(); });
  const t=Date.now(); while(!(await p.evaluate(()=>window.done)) && Date.now()-t<45000) await p.waitForTimeout(250);
  const bad = await p.evaluate(()=>window.__bad); console.log(st, 'backward moves:', bad.length, bad.slice(0,5)); await p.close(); }
await b.close(); })();
