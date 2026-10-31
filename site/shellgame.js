// Shell game: three red cups on a table under a spotlight, cartoon gloved hands from the dark, a gold coin, a shuffle that starts slow and gets quick.
// Canvas 2D, fixed 1920x1080 logical scene scaled to the container. Everything is drawn in code; no image assets needed.
// run(container, opts) -> { stop, advance(dt) (manual clock for tests), state }

const W = 1920, H = 1080;
const SPOTS = [660, 960, 1260];          // cup home x positions (1, 2, 3)
const TABLE_Y = 760;                      // where the cups sit
const CUP_H = 250, CUP_RIM = 104, CUP_TOP = 74;

const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export async function run(container, opts = {}) {
  const { onDone = () => {}, onPhase = () => {}, swaps = 11, pickSeconds = 0, seed = Date.now() % 1e9, manual = false, venue = {} } = opts;
  const rnd = mulberry32(seed);
  const accent = venue.color_accent || "#ffcd00";

  container.innerHTML = `<div class="sg-wrap" style="position:relative;width:100%;height:100%;background:#05060a;overflow:hidden"><canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas><div class="sg-cap" style="position:absolute;left:0;right:0;top:7%;text-align:center;font:600 3.2vh/1.2 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.8);opacity:0;transition:opacity .35s;letter-spacing:.02em"></div></div>`;
  const canvas = container.querySelector("canvas"), cap = container.querySelector(".sg-cap");
  const ctx = canvas.getContext("2d");
  const say = (t) => { cap.textContent = t; cap.style.opacity = t ? 1 : 0; };

  // ---- scene state ----
  const cups = SPOTS.map((x, i) => ({ x, y: TABLE_Y, lift: 0, tilt: 0, sx: 1, sy: 1, slot: i, hasCoin: false }));
  const coin = { x: SPOTS[1], y: TABLE_Y, z: 0, spin: 0, visible: false, sparkle: 0 };
  // hands: positions are where the fingertips/grip centre is; `arm` angle where the sleeve goes up into the dark
  const hands = [
    { x: 520, y: -260, grip: 0, pinch: 0, side: -1, visible: true, target: null },
    { x: 1400, y: -260, grip: 0, pinch: 0, side: 1, visible: true, target: null },
  ];
  let coinCup = 1; // index into cups[] of the cup covering the coin
  let phase = "idle"; let stopped = false; let simTime = 0;
  const state = { cups, coin, hands, get phase() { return phase; }, get coinSlot() { return cups[coinCup].slot; } };

  // ---- tween machinery (all motion goes through here so it stays smooth and interruptible) ----
  const tweens = new Set();
  const tween = (ms, fn, ease = easeInOut) => new Promise((res) => { const tw = { t: 0, ms, fn, ease, res }; tweens.add(tw); fn(0); });
  const wait = (ms) => tween(ms, () => {}, (t) => t);
  function advance(dt) {
    simTime += dt;
    for (const tw of [...tweens]) { tw.t += dt * 1000; const k = clamp(tw.t / tw.ms, 0, 1); tw.fn(tw.ease(k), k); if (k >= 1) { tweens.delete(tw); tw.res(); } }
    // secondary motion: tilt follows velocity, settles back
    for (const c of cups) { const vx = c.x - (c.px ?? c.x); c.px = c.x; c.tilt = lerp(c.tilt, clamp(vx * 0.022, -0.22, 0.22), 0.35); c.sx = lerp(c.sx, 1, 0.2); c.sy = lerp(c.sy, 1, 0.2); }
    coin.spin += dt * 2.2; coin.sparkle = Math.max(0, coin.sparkle - dt);
  }

  // ---- drawing ----
  function drawTable() {
    // void
    ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, W, H);
    // spotlight cone (soft, from above centre)
    const cone = ctx.createLinearGradient(0, 0, 0, H);
    cone.addColorStop(0, "rgba(255,240,200,0.00)"); cone.addColorStop(0.35, "rgba(255,240,200,0.06)"); cone.addColorStop(0.75, "rgba(255,240,200,0.10)"); cone.addColorStop(1, "rgba(255,240,200,0.0)");
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(760, -40); ctx.lineTo(1160, -40); ctx.lineTo(1900, 1080); ctx.lineTo(20, 1080); ctx.closePath(); ctx.fill();
    // table top: perspective slab
    const TOP = 600, BOT = H;
    ctx.save(); ctx.beginPath(); ctx.moveTo(260, TOP); ctx.lineTo(1660, TOP); ctx.lineTo(2300, BOT); ctx.lineTo(-380, BOT); ctx.closePath(); ctx.clip();
    const wood = ctx.createLinearGradient(0, TOP, 0, BOT); wood.addColorStop(0, "#5a3a22"); wood.addColorStop(1, "#2a1a0f"); ctx.fillStyle = wood; ctx.fillRect(0, TOP, W, BOT - TOP);
    // planks converging toward a vanishing point above the table, alternating tone, with a few grain streaks along each
    const VP = { x: 960, y: -900 }, k = (TOP - VP.y) / (BOT - VP.y), px = (xb, y) => VP.x + (xb - VP.x) * ((y - VP.y) / (BOT - VP.y));
    for (let i = -9; i < 9; i++) { const x0 = 960 + i * 240, x1 = x0 + 240; ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.03)"; ctx.beginPath(); ctx.moveTo(x0, BOT); ctx.lineTo(x1, BOT); ctx.lineTo(px(x1, TOP), TOP); ctx.lineTo(px(x0, TOP), TOP); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.045)"; ctx.lineWidth = 2; for (const f of [0.22, 0.5, 0.74]) { const xg = x0 + 240 * f; ctx.beginPath(); ctx.moveTo(xg, BOT); ctx.lineTo(px(xg, TOP), TOP); ctx.stroke(); } }
    ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 3; for (let i = -9; i <= 9; i++) { const xb = 960 + i * 240; ctx.beginPath(); ctx.moveTo(xb, BOT); ctx.lineTo(px(xb, TOP), TOP); ctx.stroke(); }
    // spotlight pool
    const pool = ctx.createRadialGradient(960, 790, 60, 960, 790, 820); pool.addColorStop(0, "rgba(255,236,190,0.40)"); pool.addColorStop(0.45, "rgba(255,236,190,0.16)"); pool.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = pool; ctx.save(); ctx.scale(1, 0.42); ctx.beginPath(); ctx.arc(960, 790 / 0.42, 820, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // numbers painted on the table in front of each spot
    ctx.fillStyle = "rgba(255,235,180,0.55)"; ctx.font = "700 54px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    SPOTS.forEach((x, i) => { ctx.save(); ctx.translate(x, TABLE_Y + 150); ctx.scale(1, 0.55); ctx.fillText(String(i + 1), 0, 0); ctx.restore(); });
    ctx.restore();
    // table front edge
    ctx.fillStyle = "#1a100a"; ctx.fillRect(0, H - 6, W, 6);
    // vignette
    const vg = ctx.createRadialGradient(960, 700, 500, 960, 700, 1300); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.85)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  function drawShadow(x, y, rx, lift) {
    const a = clamp(0.5 - lift / 600, 0.12, 0.5), spread = 1 + lift / 300;
    ctx.save(); ctx.translate(x + lift * 0.15, y + 6); ctx.scale(spread, 0.32 * spread); const g = ctx.createRadialGradient(0, 0, rx * 0.3, 0, 0, rx * 1.25); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * 1.25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawCoin(c) {
    if (!c.visible) return;
    const y = c.y - c.z; drawShadow(c.x, c.y, 50, c.z);
    ctx.save(); ctx.translate(c.x, y);
    const flip = Math.abs(Math.cos(c.spin)); ctx.scale(1, 0.42 * (0.35 + 0.65 * flip));
    const g = ctx.createRadialGradient(-14, -14, 6, 0, 0, 66); g.addColorStop(0, "#fff3b0"); g.addColorStop(0.5, "#f5c518"); g.addColorStop(1, "#b8860b");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = "#8a6508"; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#8a6508"; ctx.font = "900 54px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("LC", 0, 3);
    ctx.restore();
    if (c.sparkle > 0) { const n = 6; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + simTime * 3, r = 90 + 30 * Math.sin(simTime * 9 + i), k = c.sparkle; ctx.save(); ctx.translate(c.x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5); ctx.rotate(simTime * 4 + i); ctx.fillStyle = `rgba(255,250,200,${0.9 * Math.min(1, k)})`; ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? 4 : 14; ctx.lineTo(Math.cos(j * Math.PI / 4) * rr, Math.sin(j * Math.PI / 4) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); } }
  }
  function drawCup(c) {
    const y = c.y - c.lift;
    drawShadow(c.x, c.y, CUP_RIM, c.lift);
    ctx.save(); ctx.translate(c.x, y); ctx.rotate(c.tilt); ctx.scale(c.sx * (c.ds || 1), c.sy * (c.ds || 1));
    const rim = CUP_RIM, top = CUP_TOP, h = CUP_H, ry = 0.3;
    // body (upside-down cup: wide rim at the table, narrow base up top)
    const body = ctx.createLinearGradient(-rim, 0, rim, 0); body.addColorStop(0, "#8f1118"); body.addColorStop(0.28, "#e0262e"); body.addColorStop(0.5, "#f04a50"); body.addColorStop(0.72, "#d81f27"); body.addColorStop(1, "#7a0f15");
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-rim, 0); ctx.lineTo(-top, -h); ctx.lineTo(top, -h); ctx.lineTo(rim, 0); ctx.ellipse(0, 0, rim, rim * ry, 0, 0, Math.PI, false); ctx.closePath(); ctx.fill();
    // rolled lip at the table (solo cup lip), drawn as a thicker band
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(0, 0, rim, rim * ry, 0, 0, Math.PI, false); ctx.lineTo(-rim, -14); ctx.ellipse(0, -14, rim, rim * ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    const lip = ctx.createLinearGradient(-rim, 0, rim, 0); lip.addColorStop(0, "#a3151b"); lip.addColorStop(0.3, "#ff5a60"); lip.addColorStop(0.55, "#ff7d82"); lip.addColorStop(0.8, "#e02a31"); lip.addColorStop(1, "#8f1118");
    ctx.fillStyle = lip; ctx.beginPath(); ctx.moveTo(-rim, -14); ctx.lineTo(-rim + 1, -30); ctx.lineTo(rim - 1, -30); ctx.lineTo(rim, -14); ctx.closePath(); ctx.fill();
    // the two ridge rings near the lip
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 3; for (const yy of [-44, -58]) { const k = 1 - (-yy) / h * (1 - top / rim); ctx.beginPath(); ctx.moveTo(-rim * k, yy); ctx.lineTo(rim * k, yy); ctx.stroke(); }
    // base disc on top
    const baseG = ctx.createLinearGradient(-top, 0, top, 0); baseG.addColorStop(0, "#b3171e"); baseG.addColorStop(0.5, "#ff6b70"); baseG.addColorStop(1, "#9c1319");
    ctx.fillStyle = baseG; ctx.beginPath(); ctx.ellipse(0, -h, top, top * ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -h, top * 0.72, top * ry * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
    // highlight streak
    ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.moveTo(-rim * 0.52, -22); ctx.lineTo(-top * 0.5, -h + 10); ctx.lineTo(-top * 0.3, -h + 10); ctx.lineTo(-rim * 0.34, -22); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // cartoon glove: a rounded palm, four fingers, a thumb, a cuff, and a sleeve fading up into the dark
  function drawHand(hd) {
    if (!hd.visible) return;
    const { x, y, grip, pinch, side } = hd;
    ctx.save(); ctx.translate(x, y);
    // sleeve up into the darkness
    const sl = ctx.createLinearGradient(0, 0, side * 120, -900); sl.addColorStop(0, "#15161c"); sl.addColorStop(0.55, "#0c0d12"); sl.addColorStop(1, "rgba(5,6,10,0)");
    ctx.fillStyle = sl; ctx.beginPath(); ctx.moveTo(-60, -60); ctx.lineTo(60, -60); ctx.lineTo(60 + side * 140, -980); ctx.lineTo(-60 + side * 140, -980); ctx.closePath(); ctx.fill();
    // cuff
    ctx.fillStyle = "#15161c"; ctx.strokeStyle = "#000"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(-74, -118, 148, 44, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f4f4f6"; ctx.strokeStyle = "#111"; ctx.lineWidth = 7; ctx.lineJoin = "round";
    // palm
    ctx.beginPath(); ctx.roundRect(-78, -96, 156, 128, 46); ctx.fill(); ctx.stroke();
    // fingers: open = spread downward; grip = curled in around a cup (shorter, closer); pinch = index+thumb meet
    const fingers = 4, spread = lerp(42, 30, grip), len = lerp(118, 72, grip), bend = lerp(0, 18, grip);
    for (let i = 0; i < fingers; i++) {
      const fx = -63 + i * spread + (grip ? 6 : 0), fy = 10 + Math.sin((i + 0.5) / fingers * Math.PI) * 10;
      ctx.beginPath(); ctx.roundRect(fx - 19, fy - 6, 38, len, 19); ctx.fill(); ctx.stroke();
      if (bend) { ctx.beginPath(); ctx.roundRect(fx - 19, fy + len - 24, 38, bend + 10, 14); ctx.fill(); ctx.stroke(); }
    }
    // thumb
    ctx.save(); ctx.translate(side * -86, -20); ctx.rotate(side * lerp(-0.9, -0.35, Math.max(grip, pinch))); ctx.beginPath(); ctx.roundRect(-18, -10, 36, lerp(96, 78, grip), 18); ctx.fill(); ctx.stroke(); ctx.restore();
    // glove seams
    ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-26 + i * 26, -62); ctx.lineTo(-26 + i * 26, -6); ctx.stroke(); }
    ctx.restore();
  }
  function render() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(2, Math.round(r.width * dpr)), ch = Math.max(2, Math.round(r.height * dpr)); if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const s = Math.min(cw / W, ch / H); ctx.setTransform(s, 0, 0, s, (cw - W * s) / 2, (ch - H * s) / 2);
    drawTable();
    // coin draws under cups; cups and hands sorted by depth (y) so front crossings overlap correctly
    drawCoin(coin);
    for (const c of [...cups].sort((a, b) => a.y - b.y)) drawCup(c);
    for (const h of hands) drawHand(h); // hands come from above, so they are always in front of the cups they hold
  }

  // ---- choreography helpers ----
  const HAND_REST = [{ x: 520, y: -300 }, { x: 1400, y: -300 }];
  const gripOffset = { dx: 0, dy: -CUP_H - 6 }; // where a hand sits when holding a cup by its base
  const moveHand = (h, to, ms, ease = easeInOut) => { const from = { x: h.x, y: h.y, grip: h.grip }; return tween(ms, (t) => { h.x = lerp(from.x, to.x, t); h.y = lerp(from.y, to.y, t); if (to.grip !== undefined) h.grip = lerp(from.grip, to.grip, t); }, ease); };
  const handToCup = (h, c, ms) => moveHand(h, { x: c.x + gripOffset.dx, y: c.y - c.lift + gripOffset.dy, grip: 1 }, ms);
  const liftCup = (c, h, up, ms, ease = easeOut) => { const from = c.lift; return tween(ms, (t) => { c.lift = lerp(from, up, t); if (h) { h.x = c.x; h.y = c.y - c.lift + gripOffset.dy; } }, ease); };
  const land = (c) => { c.sy = 0.88; c.sx = 1.08; };
  // swap two cups: a goes along the front arc, b along the back arc; hands ride along
  async function swap(ia, ib, ms, ha, hb) {
    const a = cups[ia], b = cups[ib], ax = a.x, bx = b.x, ay = TABLE_Y, front = 62, back = 48;
    const slotA = a.slot, slotB = b.slot;
    await tween(ms, (t, k) => {
      const arc = Math.sin(Math.PI * k);
      a.x = lerp(ax, bx, t); a.y = ay + front * arc; a.lift = 10 * arc; a.ds = 1 + 0.07 * arc;
      b.x = lerp(bx, ax, t); b.y = ay - back * arc; b.lift = 10 * arc; b.ds = 1 - 0.06 * arc;
      if (ha) { ha.x = a.x; ha.y = a.y - a.lift + gripOffset.dy; }
      if (hb) { hb.x = b.x; hb.y = b.y - b.lift + gripOffset.dy; }
    });
    a.y = b.y = ay; a.lift = b.lift = 0; a.ds = b.ds = 1; a.slot = slotB; b.slot = slotA;
  }
  const bySlot = (s) => cups.find((c) => c.slot === s);

  // ---- the show ----
  async function show() {
    phase = "intro"; onPhase(phase);
    await wait(500);
    // left hand lifts the middle cup, right hand brings the coin in and sets it down, flips it for show
    const mid = bySlot(1); const L = hands[0], R = hands[1];
    say("Watch the coin.");
    await Promise.all([
      handToCup(L, mid, 650),
      moveHand(R, { x: SPOTS[1] + 120, y: TABLE_Y - 420, grip: 0 }, 700),
    ]);
    await liftCup(mid, L, 330, 450);
    coin.visible = true; coin.x = R.x - 40; coin.y = TABLE_Y; coin.z = 300; R.pinch = 1;
    await tween(520, (t) => { R.x = lerp(SPOTS[1] + 120, SPOTS[1] + 40, t); R.y = lerp(TABLE_Y - 420, TABLE_Y - 200, t); coin.x = R.x - 40; coin.z = lerp(300, 0, t); coin.spin = Math.PI * 2 * t; }, easeInOut);
    coin.x = SPOTS[1]; coin.spin = Math.PI / 2; R.pinch = 0;
    await Promise.all([moveHand(R, { x: SPOTS[1] + 240, y: TABLE_Y - 520 }, 420, easeIn), wait(250)]);
    await liftCup(mid, L, 0, 380, easeIn); land(mid); coin.visible = false; mid.hasCoin = true; coinCup = cups.indexOf(mid);
    await wait(350);

    // shuffle
    phase = "shuffle"; onPhase(phase); say("Follow the cup.");
    await moveHand(R, { x: bySlot(2).x, y: TABLE_Y + gripOffset.dy, grip: 1 }, 380);
    let last = -1, dur = 700;
    for (let i = 0; i < swaps; i++) {
      // pick a pair of slots, never the same pair twice in a row; the middle is involved more often so the eye has to work
      let pair; do { const r = rnd(); pair = r < 0.4 ? [0, 1] : r < 0.8 ? [1, 2] : [0, 2]; } while ((pair[0] * 3 + pair[1]) === last); last = pair[0] * 3 + pair[1];
      const ca = bySlot(pair[0]), cb = bySlot(pair[1]);
      // hands: whichever hand is nearer takes each cup; a quick reach if it has to change cups
      const ia = cups.indexOf(ca), ib = cups.indexOf(cb);
      const dl = Math.abs(L.x - ca.x) + Math.abs(R.x - cb.x), dr = Math.abs(L.x - cb.x) + Math.abs(R.x - ca.x);
      const [hA, hB] = dl <= dr ? [L, R] : [R, L];
      const reach = Math.max(hA.x !== ca.x ? 1 : 0, hB.x !== cb.x ? 1 : 0);
      if (reach) await Promise.all([handToCup(hA, ca, Math.max(140, dur * 0.35)), handToCup(hB, cb, Math.max(140, dur * 0.35))]);
      // the hand that is further left takes the front lane so arms do not cross awkwardly
      const frontFirst = hA.x <= hB.x;
      await swap(frontFirst ? ia : ib, frontFirst ? ib : ia, dur, frontFirst ? hA : hB, frontFirst ? hB : hA);
      dur = Math.max(230, dur * (i < 3 ? 0.84 : 0.9));
      await wait(Math.max(40, 110 - i * 8));
    }
    await wait(300);

    // hands withdraw
    phase = "pick"; onPhase(phase);
    await Promise.all([moveHand(L, { ...HAND_REST[0], grip: 0 }, 650, easeIn), moveHand(R, { ...HAND_REST[1], grip: 0 }, 650, easeIn)]);
    say(pickSeconds ? "Which cup? Lock in your pick." : "Which cup?");
    if (pickSeconds) await wait(pickSeconds * 1000);
    else await wait(1800);

    // reveal: an empty cup first for suspense, then the coin
    phase = "reveal"; onPhase(phase); say("");
    const coinSlot = cups[coinCup].slot;
    const order = [0, 1, 2].filter((s) => s !== coinSlot); const decoy = bySlot(order[Math.floor(rnd() * 2)]);
    await handToCup(R, decoy, 600); await liftCup(decoy, R, 300, 420); await wait(700); await liftCup(decoy, R, 0, 320, easeIn); land(decoy);
    const winner = bySlot(coinSlot);
    await handToCup(L, winner, 520); await wait(250);
    coin.visible = true; coin.x = winner.x; coin.y = TABLE_Y; coin.z = 0; coin.spin = Math.PI / 2;
    await liftCup(winner, L, 360, 520, easeOutBack); coin.sparkle = 2.5; say(`Cup ${coinSlot + 1}!`);
    await wait(2400);
    phase = "done"; onPhase(phase);
    onDone({ coinSlot, seed });
  }

  // ---- loop ----
  let raf = 0, last = 0;
  function frame(now) { if (stopped) return; const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; advance(dt); render(); raf = requestAnimationFrame(frame); }
  if (!manual) { last = performance.now(); raf = requestAnimationFrame(frame); }
  show().catch(() => {});
  return { stop() { stopped = true; cancelAnimationFrame(raf); }, advance(dt) { advance(dt); render(); }, state, render };
}
