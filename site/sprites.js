/* Sprite-sheet racers. Standard layout: a square atlas, 4 columns x 4 rows, each frame square.
   Frames 0-7 run (90 ms each, loop), 8-11 fall (120,110,110,300 ms), 12-15 recover (220,160,140,90 ms).
   Anchor (feet) at x 50%, y 93.75% of a frame. Artwork can be swapped for any atlas with this layout.

   SPRITES.actor(atlasUrl) -> Promise<actor>   actor = { el, set(mode), tick(dt, speed), stumbleMs, ready }
   Actor draws into the same 200x240 box the vector mascots use (feet on y=240, centered on x=100). */
(function () {
  const RUN = { frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [90, 90, 90, 90, 90, 90, 90, 90], loop: true };
  const FALL = { frames: [8, 9, 10, 11], durations: [120, 110, 110, 300], loop: false };
  const RECOVER = { frames: [12, 13, 14, 15], durations: [220, 160, 140, 90], loop: false };
  // Optional second atlas ("extra"): idle 0-3, victory 4-11, exhausted 12-15, all 90 ms loops.
  const IDLE = { frames: [0, 1, 2, 3], durations: [90, 90, 90, 90], loop: true, extra: true };
  const WIN = { frames: [4, 5, 6, 7, 8, 9, 10, 11], durations: [90, 90, 90, 90, 90, 90, 90, 90], loop: true, extra: true };
  const TIRED = { frames: [12, 13, 14, 15], durations: [90, 90, 90, 90], loop: true, extra: true };
  const ANCHOR = { x: 0.5, y: 0.9375 };
  // Measured horizontal centre of the artwork per state (512px frame units) differs slightly; shift each state so the character stays put.
  const XFIX = { run: 16, fall: 0, recover: 0, idle: -14, win: -8, tired: -4 };
  const NS = "http://www.w3.org/2000/svg";
  const sizeCache = {};

  function imageSize(url) {
    if (sizeCache[url]) return sizeCache[url];
    return (sizeCache[url] = new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => rej(new Error("Could not load " + url)); im.src = url; }));
  }

  // Markup for one frame, usable anywhere (lobby, results): a nested svg showing frame `idx` of the atlas.
  function frameMarkup(url, size, idx, box = { x: -50, y: -41.25, w: 300, h: 300 }) {
    const fw = size.w / 4, fh = size.h / 4, fx = (idx % 4) * fw, fy = Math.floor(idx / 4) * fh;
    return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${fx} ${fy} ${fw} ${fh}" preserveAspectRatio="xMidYMid meet" class="sprite-frame"><image href="${url}" width="${size.w}" height="${size.h}"/></svg>`;
  }

  async function actor(url, extraUrl) {
    const size = await imageSize(url);
    let extraSize = null; if (extraUrl) { try { extraSize = await imageSize(extraUrl); } catch (e) { console.warn(e); } }
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "mascot sprite");
    g.innerHTML = frameMarkup(url, size, 0);
    const inner = g.firstElementChild, img = inner.querySelector("image");
    let mode = "idle", seq = null, acc = 0, i = 0, cur = "", t = 0, onSeqEnd = null;
    const show = (idx, extra) => {
      const key = (extra ? "e" : "m") + idx; if (key === cur) return; cur = key;
      const sz = extra ? extraSize : size, u = extra ? extraUrl : url, fw = sz.w / 4, fh = sz.h / 4;
      img.setAttribute("href", u); img.setAttribute("width", sz.w); img.setAttribute("height", sz.h);
      inner.setAttribute("viewBox", `${(idx % 4) * fw} ${Math.floor(idx / 4) * fh} ${fw} ${fh}`);
    };
    const start = (sq, end) => {
      seq = sq; acc = 0; i = 0; onSeqEnd = end || null; show(seq.frames[0], !!seq.extra);
      const fix = sq === RUN ? XFIX.run : sq === FALL ? XFIX.fall : sq === RECOVER ? XFIX.recover : sq === IDLE ? XFIX.idle : sq === WIN ? XFIX.win : XFIX.tired;
      inner.setAttribute("x", (-50 + fix * (300 / 512)).toFixed(1));
    };
    const hasExtra = () => !!extraSize;
    const a = {
      el: g, ready: true, hasExtra: hasExtra(),
      stumbleMs: FALL.durations.reduce((x, y) => x + y, 0) + RECOVER.durations.reduce((x, y) => x + y, 0),
      set(m) {
        if (m === mode) return;
        mode = m;
        if (m === "run") start(RUN);
        else if (m === "stumble") start(FALL, () => start(RECOVER, () => { mode = "run"; start(RUN); }));
        else if (m === "win") { if (hasExtra()) start(WIN); else { seq = null; show(RUN.frames[3], false); } }
        else if (m === "tired") { if (hasExtra()) start(TIRED); else { seq = null; show(RUN.frames[0], false); } }
        else { if (hasExtra()) start(IDLE); else { seq = null; show(RUN.frames[0], false); } }
      },
      tick(dt, speed = 1) {
        t += dt;
        if (seq) {
          const rate = seq === RUN ? Math.max(0.4, speed) : 1;
          acc += dt * 1000 * rate;
          while (seq && acc >= seq.durations[i]) {
            acc -= seq.durations[i]; i++;
            if (i >= seq.frames.length) { if (seq.loop) i = 0; else { i = seq.frames.length - 1; acc = 0; const f = onSeqEnd; onSeqEnd = null; if (f) { f(); } break; } }
          }
          if (seq) show(seq.frames[i], !!seq.extra);
        }
        // The artwork carries its own bounce; only add motion where no artwork exists for the state.
        let dy = 0;
        if (!hasExtra()) { if (mode === "win") dy = -Math.abs(Math.sin(t * 7)) * 34; else if (mode === "idle") dy = Math.sin(t * 3) * 2; }
        g.setAttribute("transform", `translate(0 ${dy})`);
      },
    };
    mode = ""; a.set("idle"); a.tick(0);
    return a;
  }

  // Vector mascots wrapped in the same interface, so the race engine does not care which it has.
  function vectorActor(el, stumbleMs = 900) {
    let mode = "idle", phase = Math.random() * 6;
    return {
      el, ready: true, stumbleMs,
      set(m) { mode = m; },
      tick(dt, speed = 1) { phase += dt * (mode === "stumble" ? 2 : mode === "run" ? 14 * speed : 3); window.MASCOTS.pose(el, { phase, mode: mode === "tired" ? "idle" : mode }); },
    };
  }

  // Standalone <svg> showing frame 0 of an atlas, same footprint as MASCOTS.standalone
  async function standalone(url, height = 120) {
    const size = await imageSize(url);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250" height="${height}" style="overflow:visible">${frameMarkup(url, size, 0)}</svg>`;
  }

  window.SPRITES = { actor, vectorActor, standalone, frameMarkup, imageSize, RUN, FALL, RECOVER, IDLE, WIN, TIRED, ANCHOR };
})();
