const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
for (const [w,h] of [[2560,1080],[1920,1080],[1280,1024]]) { const p = await b.newPage({ viewport: { width: w, height: h } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://' + __dirname + '/race.html?theme=halloween&style=runaway'); await p.waitForTimeout(7000); await p.screenshot({ path: `shots/wide-${w}x${h}.png` }); console.log(w,h,'errors',errs); await p.close(); }
await b.close(); })();
