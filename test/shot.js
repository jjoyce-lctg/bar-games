const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 460 } });
await p.goto('file://' + __dirname + '/mascots.html'); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/mascots.png' }); await b.close(); })();
