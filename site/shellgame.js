// Shell game: three red cups on a lit round table, two cartoon gloves, a yellow ball, a shuffle that starts slow and gets quick.
// Canvas 2D, fixed 1920x1080 scene scaled to the container. Art lives in site/shell/ (table.jpg, cup.png, ball.png, {left,right}_{hover,reach,grip}.png).
// run(container, opts) -> { stop, advance(dt) (manual clock for tests), state }

const W = 1920, H = 1080;
const SPOTS = [600, 960, 1320];           // cup home x positions (1, 2, 3) on the table
const TABLE_Y = 640;                       // where the cup rims sit
const CUP_W = 262, CUP_H = 297;            // drawn cup size
const BALL_W = 80;
const LIFT = 200;
const ART = new URL("./shell/", import.meta.url).href;

const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const FILES = ["table.jpg", "cup.png", "ball.png", "left_hover.png", "left_reach.png", "left_grip.png", "right_hover.png", "right_reach.png", "right_grip.png"];
let artPromise = null;
function loadArt() {
  if (!artPromise) artPromise = Promise.all(FILES.map((f) => new Promise((res) => { const im = new Image(); im.onload = () => res([f.replace(/\.\w+$/, ""), im]); im.onerror = () => res([f.replace(/\.\w+$/, ""), null]); im.src = ART + f; }))).then((pairs) => Object.fromEntries(pairs));
  return artPromise;
}

export async function run(container, opts = {}) {
  const { onDone = () => {}, onPhase = () => {}, swaps = 20, pickSeconds = 0, seed = Date.now() % 1e9, manual = false } = opts;
  const rnd = mulberry32(seed);
  const IMG = await loadArt();

  container.innerHTML = `<div class="sg-wrap" style="position:relative;width:100%;height:100%;background:#000;overflow:hidden"><canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas><div class="sg-cap" style="position:absolute;left:0;right:0;top:6%;text-align:center;font:800 4vh/1.2 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.9);opacity:0;transition:opacity .35s;letter-spacing:.01em"></div></div>`;
  const canvas = container.querySelector("canvas"), cap = container.querySelector(".sg-cap");
  const ctx = canvas.getContext("2d");
  const say = (t) => { cap.textContent = t; cap.style.opacity = t ? 1 : 0; };

  // ---- scene state ----
  const cups = SPOTS.map((x, i) => ({ x, y: TABLE_Y, lift: 0, tilt: 0, sx: 1, sy: 1, ds: 1, slot: i }));
  const ball = { x: SPOTS[1], y: TABLE_Y, z: 0, visible: false, sparkle: 0 };
  // a hand's (x, y) is its fingertip contact point. pose: hover | reach | grip, with a short cross-fade from the previous pose
  const mk = (side, x, y) => ({ side, x, y, pose: "hover", prev: "hover", fade: 1, tilt: 0, bob: rnd() * 6 });
  const hands = [mk("left", 420, 300), mk("right", 1500, 300)];
  const REST = [{ x: 420, y: 300 }, { x: 1500, y: 300 }];
  let ballCup = 1; let phase = "idle"; let stopped = false; let simTime = 0;
  const state = { cups, ball, hands, get phase() { return phase; }, get ballSlot() { return cups[ballCup].slot; } };
  const setPose = (h, p) => { if (h.pose === p) return; h.prev = h.pose; h.pose = p; h.fade = 0; };

  // ---- tween machinery ----
  const tweens = new Set();
  const tween = (ms, fn, ease = easeInOut) => new Promise((res) => { const tw = { t: 0, ms, fn, ease, res }; tweens.add(tw); fn(0, 0); });
  const wait = (ms) => tween(ms, () => {}, (t) => t);
  function advance(dt) {
    simTime += dt;
    for (const tw of [...tweens]) { tw.t += dt * 1000; const k = clamp(tw.t / tw.ms, 0, 1); tw.fn(tw.ease(k), k); if (k >= 1) { tweens.delete(tw); tw.res(); } }
    for (const c of cups) { const vx = c.x - (c.px ?? c.x); c.px = c.x; c.tilt = lerp(c.tilt, clamp(vx * 0.02, -0.2, 0.2), 0.35); c.sx = lerp(c.sx, 1, 0.2); c.sy = lerp(c.sy, 1, 0.2); }
    for (const h of hands) { h.fade = Math.min(1, h.fade + dt / 0.14); const vx = h.x - (h.px ?? h.x); h.px = h.x; h.tilt = lerp(h.tilt, clamp(vx * 0.01, -0.15, 0.15), 0.3); }
    ball.sparkle = Math.max(0, ball.sparkle - dt);
  }

  // ---- drawing ----
  function drawShadow(x, y, rx, lift, base = 0.55) {
    const a = clamp(base - lift / 500, 0.12, base), spread = 1 + lift / 320;
    ctx.save(); ctx.translate(x + lift * 0.12, y + 4); ctx.scale(spread, 0.3 * spread); const g = ctx.createRadialGradient(0, 0, rx * 0.25, 0, 0, rx * 1.2); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawBall() {
    if (!ball.visible) return;
    drawShadow(ball.x, ball.y, BALL_W * 0.55, ball.z, 0.45);
    const y = ball.y - ball.z - BALL_W * 0.46;
    ctx.drawImage(IMG.ball, ball.x - BALL_W / 2, y - BALL_W / 2, BALL_W, BALL_W);
    if (ball.sparkle > 0) { const n = 7; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + simTime * 2.5, r = 70 + 26 * Math.sin(simTime * 8 + i), k = Math.min(1, ball.sparkle); ctx.save(); ctx.translate(ball.x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6); ctx.rotate(simTime * 4 + i); ctx.fillStyle = `rgba(255,250,210,${0.95 * k})`; ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? 4 : 15; ctx.lineTo(Math.cos(j * Math.PI / 4) * rr, Math.sin(j * Math.PI / 4) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); } }
  }
  function drawCup(c) {
    const y = c.y - c.lift;
    drawShadow(c.x, c.y, CUP_W * 0.5, c.lift);
    ctx.save(); ctx.translate(c.x, y); ctx.rotate(c.tilt); ctx.scale(c.sx * c.ds, c.sy * c.ds);
    ctx.drawImage(IMG.cup, -CUP_W / 2, -CUP_H + 10, CUP_W, CUP_H);
    ctx.restore();
  }
  // the glove art has the wrist on the outer side and fingertips toward the table; (x, y) is where the fingertips touch
  const HAND_W = 430;
  const TIP = { left: { x: 0.70, y: 0.86 }, right: { x: 0.30, y: 0.86 } };
  function drawHandPose(h, pose, alpha) {
    const im = IMG[`${h.side}_${pose}`]; if (!im || alpha <= 0) return;
    const w = HAND_W, hh = w * im.height / im.width, tip = TIP[h.side];
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(h.x, h.y); ctx.rotate(h.tilt); ctx.drawImage(im, -w * tip.x, -hh * tip.y, w, hh); ctx.restore();
  }
  function drawHand(h) {
    const bob = Math.sin(simTime * 1.6 + h.bob) * (h.pose === "hover" ? 5 : 0);
    ctx.save(); ctx.translate(0, bob);
    if (h.fade < 1) drawHandPose(h, h.prev, 1 - h.fade);
    drawHandPose(h, h.pose, h.fade < 1 ? h.fade : 1);
    ctx.restore();
  }
  function render() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(2, Math.round(r.width * dpr)), ch = Math.max(2, Math.round(r.height * dpr)); if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const s = Math.min(cw / W, ch / H); ctx.setTransform(s, 0, 0, s, (cw - W * s) / 2, (ch - H * s) / 2);
    ctx.fillStyle = "#000"; ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.drawImage(IMG.table, 0, 0, W, H);
    // slot numbers painted on the table in front of each spot
    ctx.fillStyle = "rgba(255,244,210,0.75)"; ctx.font = "900 72px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    SPOTS.forEach((x, i) => { ctx.save(); ctx.translate(x, TABLE_Y + 100); ctx.scale(1, 0.55); ctx.fillText(String(i + 1), 0, 0); ctx.restore(); });
    drawBall();
    for (const c of [...cups].sort((a, b) => a.y - b.y)) drawCup(c);
    for (const h of hands) drawHand(h);
  }

  // ---- choreography helpers ----
  const gripAt = (c) => ({ x: c.x + (c.gripSide === "right" ? 16 : -16), y: c.y - c.lift - CUP_H + 34 });
  const moveHand = (h, to, ms, ease = easeInOut) => { const from = { x: h.x, y: h.y }; return tween(ms, (t) => { h.x = lerp(from.x, to.x, t); h.y = lerp(from.y, to.y, t); }, ease); };
  async function handToCup(h, c, ms) { c.gripSide = h.side; setPose(h, "reach"); await moveHand(h, gripAt(c), ms); setPose(h, "grip"); }
  const follow = (h, c) => { const g = gripAt(c); h.x = g.x; h.y = g.y; };
  const liftCup = (c, h, up, ms, ease = easeOut) => { const from = c.lift; return tween(ms, (t) => { c.lift = lerp(from, up, t); if (h) follow(h, c); }, ease); };
  const land = (c) => { c.sy = 0.9; c.sx = 1.06; };
  async function swap(ia, ib, ms, ha, hb) {
    const a = cups[ia], b = cups[ib], ax = a.x, bx = b.x, ay = TABLE_Y, front = 56, back = 44, slotA = a.slot, slotB = b.slot;
    await tween(ms, (t, k) => {
      const arc = Math.sin(Math.PI * k);
      a.x = lerp(ax, bx, t); a.y = ay + front * arc; a.lift = 8 * arc; a.ds = 1 + 0.06 * arc;
      b.x = lerp(bx, ax, t); b.y = ay - back * arc; b.lift = 8 * arc; b.ds = 1 - 0.05 * arc;
      if (ha) follow(ha, a); if (hb) follow(hb, b);
    });
    a.y = b.y = ay; a.lift = b.lift = 0; a.ds = b.ds = 1; a.slot = slotB; b.slot = slotA;
  }
  const bySlot = (s) => cups.find((c) => c.slot === s);
  const restHand = async (h, ms = 600) => { setPose(h, "reach"); await moveHand(h, REST[h.side === "left" ? 0 : 1], ms, easeInOut); setPose(h, "hover"); };

  // ---- the show ----
  async function show() {
    phase = "intro"; onPhase(phase);
    await wait(600);
    const L = hands[0], R = hands[1], mid = bySlot(1);
    say("Watch the ball.");
    // left glove lifts the middle cup; right glove brings the ball in and sets it down
    await Promise.all([handToCup(L, mid, 700), (async () => { setPose(R, "reach"); await moveHand(R, { x: SPOTS[1] + 150, y: TABLE_Y - 380 }, 750); })()]);
    await liftCup(mid, L, LIFT, 480);
    ball.visible = true; ball.x = R.x - 36; ball.y = TABLE_Y; ball.z = 330; setPose(R, "grip");
    await tween(560, (t) => { R.x = lerp(SPOTS[1] + 150, SPOTS[1] + 36, t); R.y = lerp(TABLE_Y - 380, TABLE_Y - 40, t); ball.x = R.x - 36; ball.z = lerp(330, 0, easeOut(t)); }, easeInOut);
    ball.x = SPOTS[1]; ball.z = 0; setPose(R, "reach");
    await Promise.all([moveHand(R, { x: SPOTS[1] + 300, y: TABLE_Y - 330 }, 420, easeIn), wait(300)]);
    await liftCup(mid, L, 0, 380, easeIn); land(mid); ball.visible = false; ballCup = cups.indexOf(mid);
    await wait(400);

    // shuffle: slow first swaps, quick by the sixth, feints once it is quick
    phase = "shuffle"; onPhase(phase); say("Follow the cup.");
    await handToCup(R, bySlot(2), 420);
    let last = -1, dur = 720, feint = false;
    for (let i = 0; i < swaps; i++) {
      let pair;
      if (feint) { pair = [Math.floor(last / 3), last % 3]; feint = false; }
      else { do { const r = rnd(); pair = r < 0.4 ? [0, 1] : r < 0.8 ? [1, 2] : [0, 2]; } while ((pair[0] * 3 + pair[1]) === last); feint = i >= 5 && i < swaps - 1 && rnd() < 0.25; }
      last = pair[0] * 3 + pair[1];
      const ca = bySlot(pair[0]), cb = bySlot(pair[1]);
      // left glove takes the cup further left, so the gloves never cross
      const dl = Math.abs(L.x - ca.x) + Math.abs(R.x - cb.x), dr = Math.abs(L.x - cb.x) + Math.abs(R.x - ca.x);
      const [hA, hB] = dl <= dr ? [L, R] : [R, L];
      const reach = Math.hypot(hA.x - gripAt(ca).x, hA.y - gripAt(ca).y) > 30 || Math.hypot(hB.x - gripAt(cb).x, hB.y - gripAt(cb).y) > 30;
      if (reach) await Promise.all([handToCup(hA, ca, Math.max(120, dur * 0.3)), handToCup(hB, cb, Math.max(120, dur * 0.3))]);
      const ia = cups.indexOf(ca), ib = cups.indexOf(cb), frontFirst = hA.x <= hB.x;
      await swap(frontFirst ? ia : ib, frontFirst ? ib : ia, dur, frontFirst ? hA : hB, frontFirst ? hB : hA);
      dur = Math.max(200, dur * 0.78);
      await wait(feint ? 20 : Math.max(25, 90 - i * 12));
    }
    await wait(300);

    // gloves back to hovering at the sides
    phase = "pick"; onPhase(phase);
    await Promise.all([restHand(L, 650), restHand(R, 650)]);
    say(pickSeconds ? "Which cup? Lock in your pick." : "Which cup?");
    await wait(pickSeconds ? pickSeconds * 1000 : 1800);

    // reveal: one empty cup first, then the ball
    phase = "reveal"; onPhase(phase); say("");
    const ballSlot = cups[ballCup].slot;
    const others = [0, 1, 2].filter((s) => s !== ballSlot); const decoy = bySlot(others[Math.floor(rnd() * 2)]);
    const hD = decoy.x < SPOTS[1] ? L : R;
    await handToCup(hD, decoy, 600); await liftCup(decoy, hD, LIFT, 440); await wait(750); await liftCup(decoy, hD, 0, 340, easeIn); land(decoy);
    const winner = bySlot(ballSlot), hW = hD === L ? R : L;
    await Promise.all([handToCup(hW, winner, 560), restHand(hD, 560)]); await wait(250);
    ball.visible = true; ball.x = winner.x; ball.y = TABLE_Y; ball.z = 0;
    await liftCup(winner, hW, LIFT, 560, easeOutBack); ball.sparkle = 2.6; say(`Cup ${ballSlot + 1}!`);
    await wait(2600);
    phase = "done"; onPhase(phase);
    onDone({ coinSlot: ballSlot, ballSlot, seed });
  }

  // ---- loop ----
  let raf = 0, last = 0;
  function frame(now) { if (stopped) return; const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; advance(dt); render(); raf = requestAnimationFrame(frame); }
  if (!manual) { last = performance.now(); raf = requestAnimationFrame(frame); }
  show().catch(() => {});
  return { stop() { stopped = true; cancelAnimationFrame(raf); }, advance(dt) { advance(dt); render(); }, state, render };
}
