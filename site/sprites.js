/* Sprite-sheet racers. Standard layout: a square atlas, 4 columns x 4 rows, each frame square.
   Frames 0-7 run (90 ms each, loop), 8-11 fall (120,110,110,300 ms), 12-15 recover (220,160,140,90 ms).
   Anchor (feet) at x 50%, y 93.75% of a frame. Artwork can be swapped for any atlas with this layout.

   SPRITES.actor(atlasUrl) -> Promise<actor>   actor = { el, set(mode), tick(dt, speed), stumbleMs, ready }
   Actor draws into the same 200x240 box the vector mascots use (feet on y=240, centered on x=100). */
(function () {
  const RUN = { frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [90, 90, 90, 90, 90, 90, 90, 90], loop: true };
  const FALL = { frames: [8, 9, 10, 11], durations: [120, 110, 110, 300], loop: false };
  const RECOVER = { frames: [12, 13, 14, 15], durations: [220, 160, 140, 90], loop: false };
  const ANCHOR = { x: 0.5, y: 0.9375 };
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

  async function actor(url) {
    const size = await imageSize(url);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "mascot sprite");
    // Box: anchor (feet) lands on (100, 240). Frame drawn 300px tall, so anchor y = 0.9375*300 = 281.25 -> offset -41.25; x center 150 -> offset -50.
    g.innerHTML = frameMarkup(url, size, 0);
    const inner = g.firstElementChild;
    const fw = size.w / 4, fh = size.h / 4;
    let mode = "idle", seq = RUN, acc = 0, i = 0, cur = -1, t = 0, onSeqEnd = null;
    const show = (idx) => { if (idx === cur) return; cur = idx; inner.setAttribute("viewBox", `${(idx % 4) * fw} ${Math.floor(idx / 4) * fh} ${fw} ${fh}`); };
    const start = (s, end) => { seq = s; acc = 0; i = 0; onSeqEnd = end || null; show(seq.frames[0]); };
    const a = {
      el: g, ready: true, stumbleMs: FALL.durations.reduce((x, y) => x + y, 0) + RECOVER.durations.reduce((x, y) => x + y, 0),
      set(m) {
        if (m === mode) return;
        mode = m;
        if (m === "run") start(RUN);
        else if (m === "stumble") start(FALL, () => start(RECOVER, () => { mode = "run"; start(RUN); }));
        else if (m === "win") { seq = null; show(RUN.frames[3]); }
        else { seq = null; show(RUN.frames[0]); }
      },
      tick(dt, speed = 1) {
        t += dt;
        if (seq) {
          const rate = seq === RUN ? Math.max(0.4, speed) : 1;
          acc += dt * 1000 * rate;
          while (acc >= seq.durations[i]) {
            acc -= seq.durations[i]; i++;
            if (i >= seq.frames.length) { if (seq.loop) i = 0; else { i = seq.frames.length - 1; acc = 0; const f = onSeqEnd; onSeqEnd = null; if (f) { f(); } break; } }
          }
          if (seq) show(seq.frames[i]);
        }
        let dy = 0, rot = 0;
        if (mode === "win") dy = -Math.abs(Math.sin(t * 7)) * 34;
        else if (mode === "idle") dy = Math.sin(t * 3) * 2;
        g.setAttribute("transform", `translate(0 ${dy}) rotate(${rot} 100 240)`);
      },
    };
    a.set("idle"); a.tick(0);
    return a;
  }

  // Vector mascots wrapped in the same interface, so the race engine does not care which it has.
  function vectorActor(el, stumbleMs = 900) {
    let mode = "idle", phase = Math.random() * 6;
    return {
      el, ready: true, stumbleMs,
      set(m) { mode = m; },
      tick(dt, speed = 1) { phase += dt * (mode === "stumble" ? 2 : mode === "run" ? 14 * speed : 3); window.MASCOTS.pose(el, { phase, mode }); },
    };
  }

  // Standalone <svg> showing frame 0 of an atlas, same footprint as MASCOTS.standalone
  async function standalone(url, height = 120) {
    const size = await imageSize(url);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250" height="${height}" style="overflow:visible">${frameMarkup(url, size, 0)}</svg>`;
  }

  window.SPRITES = { actor, vectorActor, standalone, frameMarkup, imageSize, RUN, FALL, RECOVER, ANCHOR };
})();
