
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
for (const st of ['photo','comeback','runaway']) { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://' + __dirname + '/race.html?style=' + st);
  const t=Date.now(); let photo=false; while(!(await p.evaluate(()=>window.done)) && Date.now()-t<40000){ if(await p.$('.race-photo')) photo=true; await p.waitForTimeout(200);} 
  await p.screenshot({ path: `shots/style-${st}.png` });
  console.log(st, 'photo banner:', photo, 'errors', errs); await p.close(); }
await b.close(); })();
