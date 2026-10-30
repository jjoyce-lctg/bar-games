
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
for (const th of ['halloween','thanksgiving','christmas']) { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://' + __dirname + '/race.html?theme=' + th + '&style=runaway'); await p.waitForTimeout(7000); await p.screenshot({ path: `shots/theme-${th}.png` });
  const t=Date.now(); while(!(await p.evaluate(()=>window.done)) && Date.now()-t<40000) await p.waitForTimeout(300);
  await p.screenshot({ path: `shots/theme-${th}-finish.png` }); console.log(th, 'errors', errs); await p.close(); }
await b.close(); })();
