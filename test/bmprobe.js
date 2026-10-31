// Hold the camera still at a fixed shot and measure pure render cost with scene features toggled.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8777);
const variants = {
  base: '',
  sky2048: 'const T = window.__THREE, sc = window.__scene; const src = sc.background.image; const cv = document.createElement("canvas"); cv.width = 2048; cv.height = 1024; cv.getContext("2d").drawImage(src, 0, 0, 2048, 1024); const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; sc.background = null; const g = new T.SphereGeometry(480, 40, 20); const m = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false })); m.scale.x = -1; m.renderOrder = 999; sc.add(m);',
  sky1024: 'const T = window.__THREE, sc = window.__scene; const src = sc.background.image; const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512; cv.getContext("2d").drawImage(src, 0, 0, 1024, 512); const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; sc.background = null; const g = new T.SphereGeometry(480, 40, 20); const m = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false })); m.scale.x = -1; m.renderOrder = 999; sc.add(m);',
  sky512: 'const T = window.__THREE, sc = window.__scene; const src = sc.background.image; const cv = document.createElement("canvas"); cv.width = 512; cv.height = 256; cv.getContext("2d").drawImage(src, 0, 0, 512, 256); const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; sc.background = null; const g = new T.SphereGeometry(480, 40, 20); const m = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false })); m.scale.x = -1; m.renderOrder = 999; sc.add(m);',
  skyLast: 'const T = window.__THREE, sc = window.__scene; const tex = sc.background; sc.background = null; const g = new T.SphereGeometry(480, 40, 20); const m = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false })); m.scale.x = -1; m.renderOrder = 999; sc.add(m);',
  skyLastHalf: 'window.__ratio = 0.5; const T = window.__THREE, sc = window.__scene; const tex = sc.background; sc.background = null; const g = new T.SphereGeometry(480, 40, 20); const m = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false })); m.scale.x = -1; m.renderOrder = 999; sc.add(m);',
  nosky: 'window.__scene.background = null;',
  half: 'window.__ratio = 0.5;',
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, js] of Object.entries(variants)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto(`http://localhost:8777/barmarbles-preview.html?n=20&steps=0&quality=${process.argv[2] || 'lite'}&stats=1`);
    await p.waitForTimeout(3000);
    await p.evaluate((js) => { window.__cam = { pos: [30, 70, 60], look: [20, 60, 20] }; eval(js); }, js);
    await p.waitForTimeout(1500);
    const out = []; for (let i = 0; i < 3; i++) { out.push(await p.evaluate(() => { const r = window.__renderer, gl = r.getContext(); r.render(window.__scene, window.__camera); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t = performance.now(); for (let k = 0; k < 4; k++) { r.render(window.__scene, window.__camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t) / 4).toFixed(0); })); }
    console.log(name.padEnd(12), 'frame ms', out.join(' '));
    await p.close();
  }
  await b.close(); server.close();
})();
