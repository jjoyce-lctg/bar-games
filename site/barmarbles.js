/* Bar Marbles: 3D marble race (Three.js + Rapier). ES module.
   import { run } from "./barmarbles.js";
   const ctl = await run(containerEl, { players: [{ id, name, color? }], venue, course: "classic", onFinish(order), onDone(order) });
   ctl.stop() */
import * as THREE from "./vendor/three.module.min.js";
import RAPIER from "./vendor/rapier.es.js";

const PALETTE = ["#ff5c5c", "#ffb84d", "#ffe14d", "#7ee2a8", "#5cc8ff", "#b48cff", "#ff8ad8", "#ff9f6e", "#9ef0ff", "#c9f05c", "#f7f7f7", "#ffd23f", "#4dffb8", "#ff4d9a"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (p) => String(p.name || "").trim().split(/\s+/)[0] || "?";
const BALL_R = 0.45, PIPE_R = 2.4, PIPE_ARC = 118; // degrees each side from the bottom

const CSS = `
  .bm-wrap{position:relative;width:100%;height:100%;overflow:hidden;background:#0b0f14;font-family:"Inter",system-ui,sans-serif}
  .bm-wrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  .bm-hud{position:absolute;inset:0;pointer-events:none}
  .bm-comm{position:absolute;left:3vw;top:3vh;max-width:46vw;background:rgba(0,0,0,.72);color:#fff;border-left:1.2vh solid var(--accent,#ffcd00);padding:1.6vh 2.4vh;font-size:4.2vh;font-weight:800;border-radius:1.2vh;opacity:0;transform:translateY(-1vh);transition:opacity .25s,transform .25s;text-transform:uppercase}
  .bm-comm.on{opacity:1;transform:none}
  .bm-board{position:absolute;right:3vw;top:3vh;background:rgba(0,0,0,.72);border-radius:1.2vh;padding:1.2vh 1.6vh;color:#fff;min-width:22vw}
  .bm-board h3{margin:0 0 .6vh;font-family:"Bebas Neue",Impact,sans-serif;font-size:3.2vh;letter-spacing:.08em;color:var(--accent,#ffcd00)}
  .bm-board .row{display:flex;align-items:center;gap:1.2vh;font-size:2.8vh;font-weight:700;padding:.5vh 0}
  .bm-board .row .pos{width:3.2vh;height:3.2vh;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-size:2vh;font-weight:900}
  .bm-board .row .dot{width:2.6vh;height:2.6vh;border-radius:50%;border:2px solid rgba(255,255,255,.7)}
  .bm-board .row.done .pos{background:var(--accent,#ffcd00)}
  .bm-board .prog{height:1.2vh;background:rgba(255,255,255,.12);border-radius:1vh;margin-top:1vh;overflow:hidden}
  .bm-board .prog i{display:block;height:100%;background:var(--accent,#ffcd00);width:0;transition:width .2s}
  .bm-count{position:absolute;left:3vw;bottom:3vh;color:#fff;font-size:2.6vh;opacity:.85}
  .bm-count b{font-family:"Bebas Neue",Impact,sans-serif;font-size:5vh;color:var(--accent,#ffcd00);vertical-align:-.1em}
  .bm-big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none}
  .bm-big .t{font-family:"Bebas Neue",Impact,sans-serif;font-size:20vh;line-height:1;color:var(--accent,#ffcd00);text-shadow:0 1vh 4vh rgba(0,0,0,.7);animation:bmpop .5s cubic-bezier(.2,1.4,.4,1) both;text-align:center;max-width:90vw}
  .bm-big .s{font-size:4.5vh;font-weight:800;color:#fff;text-shadow:0 .5vh 2vh rgba(0,0,0,.7);margin-top:1vh}
  @keyframes bmpop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
  .bm-fade{position:absolute;inset:0;background:#0b0f14;opacity:0;transition:opacity 1.2s ease;pointer-events:none}
  .bm-fade.on{opacity:1}
  .bm-final{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:2vh;color:#fff;opacity:0;transition:opacity .8s ease}
  .bm-final.on{display:flex;opacity:1}
  .bm-final h2{font-family:"Bebas Neue",Impact,sans-serif;font-size:9vh;letter-spacing:.04em;color:var(--accent,#ffcd00);margin:0}
  .bm-final .win{font-family:"Bebas Neue",Impact,sans-serif;font-size:16vh;line-height:1;color:#fff;text-shadow:0 1vh 4vh rgba(0,0,0,.7);animation:bmpop .5s cubic-bezier(.2,1.4,.4,1) both}
  .bm-final .pl{display:flex;flex-direction:column;gap:1.2vh;margin-top:2vh;min-width:40vw}
  .bm-final .pl div{display:flex;align-items:center;gap:2vh;font-size:4.2vh;font-weight:800;background:rgba(255,255,255,.08);border-radius:1.2vh;padding:1vh 2.4vh;animation:bmpop .4s both}
  .bm-final .pl .pos{width:5vh;height:5vh;border-radius:50%;background:var(--accent,#ffcd00);color:#111;display:flex;align-items:center;justify-content:center;font-size:3vh;font-weight:900}
  .bm-final .pl .dot{width:3.2vh;height:3.2vh;border-radius:50%;border:.4vh solid #fff}
`;
function injectCss() { if (!document.getElementById("bm-css")) { const s = document.createElement("style"); s.id = "bm-css"; s.textContent = CSS; document.head.appendChild(s); } }

// ---------- courses: a list of 3D control points, start first, finish last (descending) ----------
function helix(cx, cz, r, y0, y1, turns, n, startAngle = 0, dir = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = startAngle + dir * t * turns * Math.PI * 2; out.push(new THREE.Vector3(cx + Math.cos(a) * r, y0 + (y1 - y0) * t, cz + Math.sin(a) * r)); }
  return out;
}
// make each segment start exactly where the previous one ended (unless the previous one is a jump), so there is no gap to fall through
function joinSegments(segs) {
  for (let i = 1; i < segs.length; i++) { const prev = segs[i - 1]; if (prev.kick || segs[i].funnel) continue; segs[i].points.unshift(prev.funnel ? new THREE.Vector3(prev.funnel.center.x, prev.funnel.yHole, prev.funnel.center.z) : prev.points[prev.points.length - 1].clone()); }
}
const COURSES = {
  classic() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const segs = [];
    // 1. opening run with two bends, ending in a kick (jump 1)
    segs.push({ points: [V(0, 96, 0), V(0, 94, 10), V(1, 89, 24), V(8, 83, 38), V(24, 79, 48), V(42, 76, 44), V(52, 71, 30), V(51, 67.5, 20), V(50, 64.5, 12)], kick: true });
    // 2. landing bowl (wider), into the spiral: enters heading -x at (10,57,0), exits heading +z at (26,30,-16)
    segs.push({ points: [V(50, 62, 10.5), V(49.3, 60.5, 3), V(47.5, 58.5, -5), V(43.5, 56.5, -11), V(38, 54.5, -13), V(29.3, 52, -11), V(24.2, 49.8, -7.8)], wide: true, r: 1.55 });
    // narrow chute that fires the marbles along the tornado's wall
    segs.push({ points: [V(19.1, 48.3, -4.6), V(14, 47.7, -1.5)], wide: true, r: 0.9 });
    // 2b. the tornado: a wide hyperbolic funnel right above the spiral. The whole field swirls here and the start grid stops mattering.
    segs.push({ funnel: { center: V(8, 44.4, -11.2), rTop: 13.6, rHole: 2.6, yHole: 34.7, turns: 4, dir: 1, wall: 5, entryAngle: 0.44 } });
    // 2c. out of the hole and into the spiral
    segs.push({ points: [V(8, 32, -11.2), V(8.6, 29.5, -12), V(10.5, 27.4, -14), V(14, 26.5, -15.8), V(18, 26, -13), V(19.8, 25.6, -8.5), V(17, 25.2, -5), V(13.5, 25.1, -4.2)], tube: true });
    // first half turn of the spiral is a closed tube (marbles arrive fast out of the tornado), then it opens up
    segs.push({ points: [...helix(10, -16, 12, 25, 5.5, 1.0, 18, Math.PI / 2, 1)], tube: true });
    segs.push({ points: [...helix(10, -16, 12, 5.5, -7.3, 0.75, 14, Math.PI / 2 + Math.PI * 2, 1)], tube: true });
    // 3. twist: a closed tube that rolls two full turns while dropping down a straight
    segs.push({ points: [V(22, -8.1, -12), V(22, -10.3, -6), V(22, -14.3, 1), V(22, -17.8, 7), V(22, -19, 10)], tube: true, roll: 2 });
    // 4. big sweep back across the course, ending in a kick (jump 2)
    segs.push({ points: [V(21.6, -19.9, 13), V(20, -21.3, 20), V(8, -23.8, 32), V(-16, -26.8, 36), V(-40, -29.8, 28), V(-62, -33.3, 6), V(-66, -35.8, -8), V(-64, -38.3, -18), V(-61, -40.8, -26)], kick: true, spinners: [0.55] });
    // 5. landing, chicane and finish straight
    segs.push({ points: [V(-59.7, -43.8, -29.4), V(-57, -46.3, -37), V(-50, -48.8, -44), V(-37, -50.3, -46), V(-18, -52, -38)], wide: true, r: 1.55, pegs: [0.3, 0.55] });
    segs.push({ points: [V(-11.6, -52.5, -33.2), V(-4, -53.3, -27.5)], wide: true, r: 1.0 });
    // 6. the funnel: the whole field swirls into one bowl and drops through the hole. Leaders lose their gap here.
    segs.push({ funnel: { center: V(1.6, -57.2, -34.9), rTop: 12, rHole: 2.6, yHole: -66.9, turns: 3, dir: -1, wall: 4, entryAngle: 2.91 } });
    // 7. the drop: closed tube straight down out of the hole, curling out toward the ledge
    segs.push({ points: [V(1.8, -72, -35), V(3, -76, -36.5), V(7, -79.5, -39), V(13, -81.5, -40)], tube: true });
    // 8. the ledge: an open, low-rimmed shelf with a spinner and bumpers. Knocked off here = respawn at the funnel.
    segs.push({ points: [V(20, -85.3, -40), V(36, -88.3, -40), V(50, -90.8, -40)], open: true, r: 1.6, arc: 50, spinners: [0.55], bumpers: [0.22] });
    // 9. finish straight
    segs.push({ points: [V(60, -92.3, -40), V(72, -93.3, -40), V(84, -94.3, -40)], wide: true });
    joinSegments(segs);
    return { segments: segs, name: "Classic", spiral: { center: V(10, 44, -16), radius: 16 } };
  },
};
export const COURSE_NAMES = Object.keys(COURSES);

function stripeTexture(accent, dark = false) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const g = cv.getContext("2d");
  g.fillStyle = dark ? "#cfd9ea" : "#dfe6f2"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#b9c4d8"; g.fillRect(0, 0, 256, 7); g.fillRect(0, 57, 256, 7);
  g.fillStyle = "#cfd8e8"; for (let x = 0; x < 256; x += 32) g.fillRect(x, 7, 2, 50); g.fillStyle = accent; g.fillRect(0, 30, 256, 4);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
// Build a funnel: a bowl (surface of revolution) with a short wall ring at the rim, open where the track enters. Samples spiral from the rim to the hole.
function buildFunnel(seg, accent, segIndex) {
  const F = seg.funnel, c = F.center, yTop = c.y, depth = yTop - F.yHole;
  const cc = depth / (1 / F.rHole - 1 / F.rTop); const prof = (r) => yTop - cc * (1 / Math.max(F.rHole, r) - 1 / F.rTop); // hyperbolic: a few degrees at the rim, near vertical at the hole
  const RINGS = 30, SEGS = 64, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= RINGS; i++) { const r = F.rTop * Math.pow(F.rHole / F.rTop, i / RINGS), y = prof(r); for (let j = 0; j <= SEGS; j++) { const a = (j / SEGS) * Math.PI * 2; pos.push(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r); uvs.push(j / SEGS * 6, i / RINGS); } }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) { const a = i * (SEGS + 1) + j, b = a + SEGS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // rim wall, with a gap around the entry
  const base = pos.length / 3, WALL_H = F.wall || 3.2, gap = 0.3;
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // the wall is low where the track comes in over it (the entry pipe's floor sits above this lip), full height everywhere else
  for (let j = 0; j <= SEGS; j++) { const a = (j / SEGS) * Math.PI * 2, h = angDiff(a, F.entryAngle) < gap ? 0.8 : WALL_H; pos.push(c.x + Math.cos(a) * F.rTop, yTop, c.z + Math.sin(a) * F.rTop); uvs.push(j / SEGS * 6, 1); pos.push(c.x + Math.cos(a) * (F.rTop + 0.2), yTop + h, c.z + Math.sin(a) * (F.rTop + 0.2)); uvs.push(j / SEGS * 6, 1.2); }
  const wallIdx = []; for (let j = 0; j < SEGS; j++) { const k = base + j * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); wallIdx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = stripeTexture(accent); const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 })); mesh.receiveShadow = true;
  const shell = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
  // samples: a spiral from the rim entry to the hole, then straight down to the hole exit
  const samples = [], tangents = [], frames = [], bank = [], n = Math.round(F.turns * 60);
  for (let i = 0; i <= n; i++) { const t = i / n, a = F.entryAngle + F.dir * t * F.turns * Math.PI * 2, r = (F.rTop - 1.2) * Math.pow(F.rHole * 0.6 / (F.rTop - 1.2), t); samples.push(new THREE.Vector3(c.x + Math.cos(a) * r, prof(r) + 0.3, c.z + Math.sin(a) * r)); }
  samples.push(new THREE.Vector3(c.x, F.yHole - 2, c.z));
  const N = samples.length - 1, up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) { const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N, i + 1)]; const t = new THREE.Vector3().subVectors(b, a).normalize(); tangents.push(t); let side = new THREE.Vector3().crossVectors(t, up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize(); const down = new THREE.Vector3().crossVectors(t, side).normalize(); if (down.y > 0) { down.negate(); side.negate(); } frames.push({ side, down }); bank.push(0); }
  const bowlIdx = idx.slice(0, idx.length - wallIdx.length);
  return { samples, tangents, frames, mesh, shell, obstacles: [], arcDeg: 180, bank, vertices: new Float32Array(pos), indices: new Uint32Array(bowlIdx), wallIndices: new Uint32Array(wallIdx), R: F.rHole, endBank: 0, segIndex, kick: false, funnel: true, loose: true };
}
// Build one segment: half-pipe (or full tube) mesh + trimesh along a Catmull-Rom spline. Returns samples/frames and geometry.
const segRadius = (seg) => (seg.wide || seg.open) ? PIPE_R * (seg.r || 1.35) : PIPE_R;
function buildSegment(seg, accent, segIndex, prevR, prevBank = 0, prevArc = PIPE_ARC) {
  const curve = new THREE.CatmullRomCurve3(seg.points, false, "centripetal", 0.5);
  const len = curve.getLength(); const N = Math.max(40, Math.round(len / 0.9)), SEG = seg.tube ? 18 : 14;
  const R = (seg.wide || seg.open) ? PIPE_R * (seg.r || 1.35) : PIPE_R, arcDeg = seg.tube ? 180 : seg.open ? (seg.arc || 60) : PIPE_ARC;
  const samples = curve.getSpacedPoints(N), tangents = [], frames = [];
  const MIN_DROP = 0.035, kickFrom = seg.kick ? Math.floor(N * 0.9) : N + 1;
  for (let i = 1; i <= N; i++) { if (i < kickFrom && samples[i].y > samples[i - 1].y - MIN_DROP) samples[i].y = samples[i - 1].y - MIN_DROP; }
  for (let k = 0; k < 3; k++) for (let i = 1; i < Math.min(N, kickFrom); i++) samples[i].y = Math.min(samples[i].y, (samples[i - 1].y + samples[i].y + samples[i + 1].y) / 3);
  if (seg.kick) { const base = samples[kickFrom - 1].y; for (let i = kickFrom; i <= N; i++) { const t = (i - kickFrom + 1) / (N - kickFrom + 1); samples[i].y = base + t * t * 0.6; } }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize(); tangents.push(t);
    let side = new THREE.Vector3().crossVectors(t, up);
    if (side.lengthSq() < 0.09 && frames.length) { // near-vertical: carry the previous frame's side across (parallel transport) so the rings never flip
      side.copy(frames[frames.length - 1].side).addScaledVector(t, -frames[frames.length - 1].side.dot(t));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    } else if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    let down = new THREE.Vector3().crossVectors(t, side).normalize();
    if (frames.length && side.dot(frames[frames.length - 1].side) < 0) { side.negate(); down.negate(); }
    else if (!frames.length && down.y > 0) { down.negate(); side.negate(); }
    else if (down.y > 0.3 && Math.abs(t.y) < 0.95) { down.negate(); side.negate(); }
    frames.push({ side, down });
  }
  const bank = new Array(N + 1).fill(0);
  for (let i = 2; i < N - 1; i++) { const cross = new THREE.Vector3().crossVectors(tangents[i - 2], tangents[i + 1]); bank[i] = THREE.MathUtils.clamp(-cross.y * 14, -0.55, 0.55); }
  for (let k = 0; k < 6; k++) for (let i = 1; i < N; i++) bank[i] = (bank[i - 1] + bank[i] + bank[i + 1]) / 3;
  if (seg.roll) for (let i = 0; i <= N; i++) bank[i] = Math.max(0, (i - 12) / (N - 12)) * seg.roll * Math.PI * 2; // roll starts once the tube has closed
  if (prevR) for (let i = 0; i <= Math.min(N, 30); i++) bank[i] = THREE.MathUtils.lerp(prevBank, bank[i], i / 30); // continue the previous segment's banking into this one
  const pos = [], uvs = [], idx = [], arc = THREE.MathUtils.degToRad(arcDeg);
  for (let i = 0; i <= N; i++) {
    const c = samples[i], { side, down } = frames[i], t = tangents[i];
    const q = new THREE.Quaternion().setFromAxisAngle(t, bank[i]); const S = side.clone().applyQuaternion(q), D = down.clone().applyQuaternion(q);
    for (let j = 0; j <= SEG; j++) { const Ri = prevR ? THREE.MathUtils.lerp(prevR, R, Math.min(1, i / 30)) : R; const cR = c.clone().addScaledVector(D, R - Ri); /* floor stays continuous while the radius blends */ const arcI = prevR ? THREE.MathUtils.lerp(THREE.MathUtils.degToRad(prevArc), arc, Math.min(1, i / (seg.tube ? 10 : 16))) : arc; const th = -arcI + (2 * arcI) * (j / SEG); const p = cR.clone().addScaledVector(S, Math.sin(th) * Ri).addScaledVector(D, Math.cos(th) * Ri); pos.push(p.x, p.y, p.z); uvs.push(i / N * (len / 8), j / SEG); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = stripeTexture(accent, !!seg.tube);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.FrontSide, roughness: 0.6, metalness: 0.05, transparent: !!seg.tube, opacity: seg.tube ? 0.75 : 1 })); mesh.receiveShadow = true;
  const shellGeo = geo.clone(); { const n = shellGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0x4a5b80, side: THREE.BackSide, roughness: 0.9, transparent: !!seg.tube, opacity: seg.tube ? 0.5 : 1 }));
  const obstacles = []; // {kind, i, off} in sample index + side offset (world placement happens in run())
  (seg.pegs || []).forEach((t) => { const i0 = Math.round(t * N); [[0, -0.42], [8, 0.42], [16, -0.42]].forEach(([di, o]) => obstacles.push({ kind: "peg", i: Math.min(N, i0 + di), off: o * R })); });
  (seg.spinners || []).forEach((t) => obstacles.push({ kind: "spinner", i: Math.round(t * N), off: 0 }));
  (seg.bumpers || []).forEach((t) => { const i0 = Math.round(t * N); obstacles.push({ kind: "bumper", i: i0, off: -0.5 * R }); obstacles.push({ kind: "bumper", i: Math.min(N, i0 + 6), off: 0.5 * R }); });
  return { samples, tangents, frames, mesh, shell, obstacles, arcDeg, bank, vertices: new Float32Array(pos), indices: new Uint32Array(idx), R, endBank: Math.atan2(Math.sin(bank[N]), Math.cos(bank[N])), segIndex, kick: !!seg.kick };
}
function buildTrack(course, accent) {
  const parts = []; course.segments.forEach((sg, i) => { if (sg.funnel) { parts.push(buildFunnel(sg, accent, i)); return; } const prev = i ? course.segments[i - 1] : null; const join = prev && !prev.kick && !prev.funnel; if (join) { const pp = parts[i - 1], ps = pp.samples, fr = pp.frames[ps.length - 1]; sg.points[0] = ps[ps.length - 1].clone().addScaledVector(fr.down, pp.R - segRadius(sg)); } /* floors line up across a change of pipe width */ parts.push(buildSegment(sg, accent, i, join ? parts[i - 1].R : 0, join ? parts[i - 1].endBank : 0, join ? parts[i - 1].arcDeg : PIPE_ARC)); });
  const samples = [], tangents = [], frames = [], segOf = [], jumps = [], obstacles = [], banks = [], loose = [];
  parts.forEach((p, i) => { if (p.kick) jumps.push(samples.length + p.samples.length - 1); p.obstacles.forEach((o) => obstacles.push({ ...o, i: o.i + samples.length })); p.bank.forEach((b) => banks.push(b)); if (p.loose) loose.push([samples.length - 30, samples.length + p.samples.length + 50]); p.samples.forEach((s, k) => { samples.push(s); tangents.push(p.tangents[k]); frames.push(p.frames[k]); segOf.push(i); }); });
  return { parts, samples, tangents, frames, segOf, jumps, obstacles, banks, loose };
}

function makeLabel(text, color) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 72; const g = cv.getContext("2d");
  g.font = "800 40px Inter, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(text, 128, 38); g.fillStyle = "#fff"; g.fillText(text, 128, 38);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(3.4, 0.95, 1); sp.renderOrder = 10; return sp;
}

export async function run(container, opts) {
  injectCss();
  await RAPIER.init();
  const { players = [], venue = {}, course = "classic", onFinish = () => {}, onDone = () => {}, placesToShow = 5, maxLabels = 160, maxStepsPerFrame = 4, render = true } = opts;
  let simTime = 0;
  const accent = venue.color_accent || "#ffcd00";
  container.innerHTML = `<div class="bm-wrap" style="--accent:${accent}"><canvas></canvas><div class="bm-hud"><div class="bm-comm"></div><div class="bm-board"><h3>Bar Marbles</h3><div class="rows"></div><div class="prog"><i></i></div></div><div class="bm-count"><b id="bmLeft">0</b> still rolling</div><div class="bm-big"></div><div class="bm-fade"></div><div class="bm-final"></div></div></div>`;
  const canvas = container.querySelector("canvas"), comm = container.querySelector(".bm-comm"), rows = container.querySelector(".bm-board .rows"), prog = container.querySelector(".bm-board .prog i"), big = container.querySelector(".bm-big"), fade = container.querySelector(".bm-fade"), finalEl = container.querySelector(".bm-final"), left = container.querySelector("#bmLeft");
  const audio = (n, d) => { try { if (window.AUDIO) window.AUDIO.event(n, d); } catch {} };
  let commTimer = null; const say = (t, ms = 2200) => { comm.textContent = t; comm.classList.add("on"); clearTimeout(commTimer); commTimer = setTimeout(() => comm.classList.remove("on"), ms); };

  // ---- three ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.innerHeight > 1100 ? 1 : 1.5, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const skyTop = new THREE.Color(venue.color_primary || "#0f2a3a").lerp(new THREE.Color("#6fb6ff"), 0.55), skyBot = new THREE.Color("#e9f2ff");
  { const cv = document.createElement("canvas"); cv.width = 2; cv.height = 256; const g = cv.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#" + skyTop.getHexString()); gr.addColorStop(1, "#" + skyBot.getHexString()); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.fog = new THREE.Fog(skyBot, 150, 320);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9bb8, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6); sun.position.set(60, 120, 40); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 1, far: 400 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: new THREE.Color(venue.color_primary || "#0f2a3a").lerp(new THREE.Color("#8fa5c4"), 0.5), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -108; ground.receiveShadow = true; scene.add(ground);

  const C = (COURSES[course] || COURSES.classic)();
  const track = buildTrack(C, accent); track.parts.forEach((p) => { scene.add(p.mesh); scene.add(p.shell); });
  C.finishT = 0.97;
  C.funnels = []; { let acc = 0; track.parts.forEach((p, i) => { if (p.funnel) { C.funnels.push({ entry: acc + 2, from: acc, to: acc + p.samples.length - 3, dampTo: acc + p.samples.length + (track.parts[i + 1] ? track.parts[i + 1].samples.length : 0), center: C.segments[i].funnel.center }); C.funnelEntry = acc + 2; } if (C.segments[i].open) C.ledgeFrom = acc; acc += p.samples.length; }); }
  const GROUND_Y = -108;
  // finish arch + checkered band
  const fi = Math.floor(C.finishT * (track.samples.length - 1)), fp = track.samples[fi], ft = track.tangents[fi], ff = track.frames[fi];
  { const arch = new THREE.Group(); const post = new THREE.CylinderGeometry(0.3, 0.3, 8, 10), pm = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(post, pm); m.position.copy(fp).addScaledVector(ff.side, s * (PIPE_R + 0.6)).add(new THREE.Vector3(0, 2, 0)); arch.add(m); }
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const g = cv.getContext("2d"); for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * 16, y * 16, 16, 16); }
    const bt = new THREE.CanvasTexture(cv); const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * PIPE_R + 1.8, 1.2, 0.3), new THREE.MeshStandardMaterial({ map: bt })); banner.position.copy(fp).add(new THREE.Vector3(0, 6, 0)); banner.lookAt(banner.position.clone().add(ft)); arch.add(banner);
    scene.add(arch); }

  // ---- physics ----
  const world = new RAPIER.World({ x: 0, y: -32, z: 0 });
  track.parts.forEach((p) => world.createCollider(RAPIER.ColliderDesc.trimesh(p.vertices, p.indices).setFriction(p.funnel ? 0.02 : 0.08).setRestitution(p.funnel ? 0.05 : 0.1)));
  // funnels get a second collision skin a little below the surface so a marble dropping in fast can never tunnel through
  track.parts.filter((p) => p.funnel).forEach((p) => { world.createCollider(RAPIER.ColliderDesc.trimesh(p.vertices, p.indices).setTranslation(0, -1.6, 0).setFriction(0.02).setRestitution(0.05)); world.createCollider(RAPIER.ColliderDesc.trimesh(p.vertices, p.wallIndices).setFriction(0.3).setRestitution(0.05)); });
  world.createCollider(RAPIER.ColliderDesc.cuboid(400, 1, 400).setTranslation(0, -109, 0));
  // ---- obstacles: pegs (bouncy posts), bumpers (big pinball pads) and spinners (kinematic rotating bars) ----
  const spinners = []; const obsMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.35, metalness: 0.2 }), bumpMat = new THREE.MeshStandardMaterial({ color: 0xff3b5c, roughness: 0.3, emissive: 0x3a0010 });
  const floorPoint = (i, off) => { const c = track.samples[i], fr = track.frames[i], R = track.parts[track.segOf[i]].R, b = track.banks[i] || 0; const q = new THREE.Quaternion().setFromAxisAngle(track.tangents[i], b); const S = fr.side.clone().applyQuaternion(q), D = fr.down.clone().applyQuaternion(q); const th = Math.asin(THREE.MathUtils.clamp(off / R, -0.95, 0.95)); return { p: c.clone().addScaledVector(S, Math.sin(th) * R).addScaledVector(D, Math.cos(th) * R), up: D.clone().negate() }; };
  const upQuat = (up) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  track.obstacles.forEach((o) => {
    const { p, up } = floorPoint(o.i, o.off);
    if (o.kind === "peg" || o.kind === "bumper") {
      const r = o.kind === "peg" ? 0.38 : 0.9, h = o.kind === "peg" ? 1.5 : 1.1, q = upQuat(up), c = p.clone().addScaledVector(up, h / 2 - 0.15);
      world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setRestitution(o.kind === "peg" ? 0.9 : 0.9).setFriction(0.05));
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 14), o.kind === "peg" ? obsMat : bumpMat); m.position.copy(c); m.quaternion.copy(q); m.castShadow = true; scene.add(m);
    } else if (o.kind === "spinner") {
      const q = upQuat(up), c = p.clone().addScaledVector(up, 0.55), R = track.parts[track.segOf[o.i]].R, armLen = R * (track.parts[track.segOf[o.i]].arcDeg < 70 ? 1.15 : 1.7);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      world.createCollider(RAPIER.ColliderDesc.cuboid(armLen / 2, 0.45, 0.3).setRestitution(0.6).setFriction(0.1), body);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.45, armLen / 2).setRestitution(0.6).setFriction(0.1), body);
      const g = new THREE.Group(); g.position.copy(c); g.quaternion.copy(q);
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.9, 0.6), obsMat), a2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, armLen), obsMat); a1.castShadow = a2.castShadow = true; g.add(a1, a2);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), bumpMat); g.add(hub); scene.add(g);
      spinners.push({ body, group: g, base: q, up, rate: (spinners.length % 2 ? -1 : 1) * 2.2, angle: 0 });
    }
  });
  // start pen: marbles stacked in the pipe behind a gate
  const gateI = 60, gp = track.samples[gateI], gt = track.tangents[gateI];
  const gate = world.createCollider(RAPIER.ColliderDesc.cuboid(PIPE_R + 0.5, PIPE_R, 0.25).setTranslation(gp.x, gp.y, gp.z).setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), gt)));
  const gateMesh = new THREE.Mesh(new THREE.BoxGeometry(2 * PIPE_R + 1, 2 * PIPE_R, 0.5), new THREE.MeshStandardMaterial({ color: 0xff4d4d })); gateMesh.position.copy(gp); gateMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gt); scene.add(gateMesh);

  const ballGeo = new THREE.SphereGeometry(BALL_R, 20, 14);
  // random start slots + a little jitter so no slot (and no sign-up order) has an edge night after night
  const slots = players.map((_, i) => i); for (let i = slots.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [slots[i], slots[k]] = [slots[k], slots[i]]; }
  const marbles = players.map((p, i) => {
    const color = p.color || PALETTE[i % PALETTE.length];
    const perRow = 4, row = Math.floor(slots[i] / perRow), col = slots[i] % perRow;
    const si = Math.max(2, gateI - 3 - row * 3), c = track.samples[si], fr = track.frames[si];
    const pos = c.clone().addScaledVector(fr.side, (col - (perRow - 1) / 2) * (BALL_R * 2.05)).addScaledVector(fr.down, PIPE_R - BALL_R - 0.15).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.2 + (row % 3) * 0.1, (Math.random() - 0.5) * 0.08));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinearDamping(0.004).setAngularDamping(0.2).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(1.2).setFriction(0.08).setRestitution(0.25), body);
    const mesh = new THREE.Mesh(ballGeo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.2, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 })); mesh.castShadow = true; scene.add(mesh);
    const label = i < maxLabels ? makeLabel(first(p).slice(0, 10), color) : null; if (label) scene.add(label);
    return { player: { ...p, color }, body, mesh, label, hint: si, prog: si, finished: false, stillFor: 0 };
  });

  // ---- state ----
  const order = []; let calledFunnel = false, calledLedge = false, firstFinishAt = -1, ending = false, lastOffAt = -9, started = false, stopped = false, finishedFlag = false, raf, last = performance.now(), acc = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camInit = false;
  // Camera director. Shots: chase (default), tracksidePan (fixed point beside the track, pans as the pack passes),
  // overhead (above the spiral), jumpCam (side-on at a jump), finishCam (at the line looking back), wide (leader to median when spread out).
  const shot = { name: "chase", until: 0, anchor: new THREE.Vector3(), lastChange: 0 };
  const zones = []; // progress ranges with a preferred shot
  { const N1 = track.samples.length - 1;
    const spiralStart = track.parts[0].samples.length + 2, spiralEnd = spiralStart + track.parts[1].samples.length - 12;
    zones.push({ from: spiralStart + 10, to: spiralEnd - 10, name: "overhead" });
    track.jumps.forEach((j) => zones.push({ from: j - 28, to: j + 45, name: "jumpCam", jump: j }));
    zones.push({ from: Math.floor(N1 * 0.9), to: N1, name: "finishCam" });
    { let acc = 0; track.parts.forEach((p, i) => { if (p.funnel) zones.push({ from: acc - 15, to: acc + p.samples.length + 40, name: "funnelCam", center: C.segments[i].funnel.center }); acc += p.samples.length; }); }
  }
  function pickShot(prog, spread, simT) {
    const z = zones.find((z) => prog >= z.from && prog <= z.to); if (z) return z;
    if (spread > 140) return { name: "wide" };
    // on open track, cut to a trackside pan for 4 s every 11 s
    const cyc = simT % 11; return cyc > 7 ? { name: "tracksidePan" } : { name: "chase" };
  }
  const N = track.samples.length - 1;
  function progressOf(m) {
    const p = m.body.translation(); let best = m.hint, bd = Infinity;
    const inLoose = track.loose.some(([a, b]) => m.hint >= a && m.hint <= b); for (let i = Math.max(0, m.hint - (inLoose ? 220 : 25)); i <= Math.min(N, m.hint + (inLoose ? 200 : 90)); i++) { const s = track.samples[i]; const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    m.hint = best; return best;
  }
  function release() { world.removeCollider(gate, false); scene.remove(gateMesh); started = true; say("And away they go!"); audio("go"); }
  let releaseAt = 1.5;
  say("Marbles are set. Gate opens in 3...", 1400);

  function showFinal(results) {
    finalEl.innerHTML = `<h2>Bar Marbles</h2><div class="win">${esc(first(results[0]).toUpperCase())} WINS!</div><div class="pl">${results.slice(0, placesToShow).map((p, i) => `<div style="animation-delay:${0.15 + i * 0.12}s"><span class="pos">${i + 1}</span><span class="dot" style="background:${p.color}"></span><span>${esc(p.name)}</span></div>`).join("")}</div>`;
    finalEl.classList.add("on");
  }
  function step(now) {
    if (stopped) return;
    if (ending) return; // simulation and rendering stop once the results are up
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt; lastDt = dt || lastDt;
    if (!started && simTime >= releaseAt) release();
    let steps = 0; while (acc >= 1 / 60 && steps < maxStepsPerFrame) { for (const sp of spinners) { sp.angle += sp.rate / 60; const q = sp.base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.angle)); sp.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); sp.group.quaternion.copy(q); } world.step(); acc -= 1 / 60; simTime += 1 / 60; steps++; } if (acc > 0.25) acc = 0;
    let leader = null, leadProg = -1, live = 0;
    for (const m of marbles) {
      const t = m.body.translation(); m.mesh.position.set(t.x, t.y, t.z); const r = m.body.rotation(); m.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (m.label) m.label.position.set(t.x, t.y + BALL_R + 0.75, t.z);
      if (m.finished) continue;
      live++;
      m.prog = progressOf(m);
      if (m.prog > leadProg) { leadProg = m.prog; leader = m; }
      // rolling resistance in the funnels (otherwise a marble can orbit the bowl forever): extra damping while inside one
      { const fi = C.funnels.findIndex((f) => m.prog >= f.from && m.prog <= f.to), inF = fi >= 0, damp = C.funnels.some((f) => m.prog >= f.from && m.prog <= f.dampTo); if (damp !== m.damped) { m.damped = damp; m.body.setLinearDamping(damp ? 0.15 : 0.004); } if (inF !== m.inFunnel) { m.inFunnel = inF; if (inF) { if (m.fIdx !== fi) { m.fEnter = simTime; m.fIdx = fi; m.fAng = 0; } m.fPrev = null; } else { const D = (window.__dwell = window.__dwell || {}); (D[m.fIdx] = D[m.fIdx] || {})[m.player.id || m.player.name] = [+(simTime - m.fEnter).toFixed(1), +(m.fAng / (2 * Math.PI)).toFixed(2)]; } }
        if (inF) { const c = C.funnels[fi].center, a = Math.atan2(t.z - c.z, t.x - c.x); if (m.fPrev !== null) { let d = a - m.fPrev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; m.fAng += d; } m.fPrev = a; } }
      // off the track (fell to the ground, or landed somewhere that isn't where it should be): back to the top
      const nearJump = track.jumps.some((j) => m.prog > j - 30 && m.prog < j + 60) || track.loose.some(([a, b]) => m.prog >= a && m.prog <= b);
      if (t.y < GROUND_Y + 1.5 || (started && !nearJump && (() => { const s = track.samples[m.prog]; return (s.x - t.x) ** 2 + (s.y - t.y) ** 2 + (s.z - t.z) ** 2 > 36; })())) {
        (window.__rs = window.__rs || []).push([m.prog, +t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1)]);
        const offLedge = m.prog >= C.ledgeFrom - 10; // past the funnel: respawn at the funnel entry, a ~10 s penalty, instead of the top
        const si = offLedge ? C.funnelEntry : 6 + Math.floor(Math.random() * 20), s = track.samples[si], fr = track.frames[si];
        const pos = s.clone().addScaledVector(fr.side, (Math.random() - 0.5) * PIPE_R).addScaledVector(fr.down, offLedge ? 0 : PIPE_R - BALL_R - 0.3);
        m.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true); m.body.setLinvel({ x: 0, y: 0, z: 0 }, true); m.body.setAngvel({ x: 0, y: 0, z: 0 }, true); m.hint = si; m.prog = si;
        m.resets = (m.resets || 0) + 1; m.offLedge = (m.offLedge || 0) + (offLedge ? 1 : 0);
        if (simTime - lastOffAt > 1.2) { say(offLedge ? `${first(m.player)} is off the ledge! Back through the funnel.` : `${first(m.player)} is off the track! Back to the top.`, 2600); audio("stumble", { racer: "marble" }); lastOffAt = simTime; }
      }
      // stalled: nudge
      const v = m.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
      if (started && sp < 0.3) { m.stillFor += dt; if (m.stillFor > 1.5) { const tg = track.tangents[m.prog]; m.body.applyImpulse({ x: tg.x * 1.2, y: 0.3, z: tg.z * 1.2 }, true); m.stillFor = 0; } } else m.stillFor = 0;
      if (m.prog >= C.finishT * N) {
        m.finished = true; order.push(m); if (m.label) m.label.visible = false;
        if (order.length === 1) { say(`${first(m.player)} takes it!`, 3500); audio("finish", { racer: "marble" }); onFinish(order.map((x) => x.player)); big.innerHTML = `<div class="t">${esc(first(m.player).toUpperCase())} WINS!</div><div class="s">${esc(m.player.name)}</div>`; }
        else if (order.length <= 3) say(`${first(m.player)} in ${["", "", "second", "third"][order.length]}!`);
      }
    }
    C.funnels.forEach((f, k) => { if (!f.called && leadProg >= f.entry) { f.called = true; say(k === 0 ? "Into the tornado! Everybody back in it." : "Into the funnel! Anyone's race now.", 2800); audio("stretch", { racer: "marble" }); } });
    if (!calledLedge && C.ledgeFrom && leadProg >= C.ledgeFrom) { calledLedge = true; say("The Ledge. Hold on!", 2200); }
    // race over once the top places are in (or everyone is): fade out, stop simulating, show the results
    const want = Math.min(placesToShow, marbles.length);
    if (!finishedFlag && (order.length >= want || (order.length >= 1 && live === 0) || (firstFinishAt >= 0 && simTime - firstFinishAt > 45))) {
      finishedFlag = true; const results = order.map((x) => x.player);
      setTimeout(() => { if (stopped) return; fade.classList.add("on"); setTimeout(() => { if (stopped) return; ending = true; big.innerHTML = ""; showFinal(results); onDone(results); }, 1300); }, 1800);
    }
    if (order.length >= 1 && firstFinishAt < 0) firstFinishAt = simTime;
    // camera: chase the leader (or the finish once someone has won)
    const focus = leader || order[order.length - 1];
    if (focus) {
      const p = new THREE.Vector3().copy(focus.body.translation()), tg = track.tangents[focus.prog], fr = track.frames[focus.prog];
      const liveProgs = marbles.filter((m) => !m.finished).map((m) => m.prog).sort((a, b) => b - a);
      const spread = liveProgs.length > 2 ? liveProgs[0] - liveProgs[Math.floor(liveProgs.length / 2)] : 0;
      const want = order.length ? { name: "finishCam" } : pickShot(focus.prog, spread, simTime);
      let cut = false;
      if ((want.name !== shot.name || (want.center && want.center !== shot.center)) && simTime - shot.lastChange > 2.5) { shot.name = want.name; shot.center = want.center || null; shot.lastChange = simTime; cut = true;
        if (want.name === "tracksidePan") { const ahead = track.samples[Math.min(N, focus.prog + 34)], f2 = track.frames[Math.min(N, focus.prog + 34)]; shot.anchor.copy(ahead).addScaledVector(f2.side, 11).add(new THREE.Vector3(0, 7, 0)); }
        if (want.name === "jumpCam") { const j = track.samples[want.jump], fj = track.frames[want.jump], tj = track.tangents[want.jump]; shot.anchor.copy(j).addScaledVector(fj.side, 22).addScaledVector(tj, 8).add(new THREE.Vector3(0, 4, 0)); }
        if (want.name === "finishCam") { shot.anchor.copy(fp).addScaledVector(ft, 16).addScaledVector(ff.side, 8).add(new THREE.Vector3(0, 9, 0)); }
      }
      let desired, look;
      if (shot.name === "overhead") { desired = C.spiral.center.clone().add(new THREE.Vector3(6, 42, 6)); look = p.clone(); }
      else if (shot.name === "tracksidePan") { desired = shot.anchor; look = p.clone(); }
      else if (shot.name === "jumpCam") { desired = shot.anchor; look = p.clone(); }
      else if (shot.name === "finishCam") { desired = shot.anchor; look = p.clone(); }
      else if (shot.name === "funnelCam") { const fc = shot.center || C.funnels[0].center; desired = fc.clone().add(new THREE.Vector3(-16, 26, 18)); look = fc.clone().add(new THREE.Vector3(0, -4, 0)); }
      else if (shot.name === "wide") { desired = p.clone().addScaledVector(tg, -34).add(new THREE.Vector3(0, 20, 0)); look = p.clone().addScaledVector(tg, -8); }
      else { desired = p.clone().addScaledVector(tg, -14).add(new THREE.Vector3(0, 7, 0)); look = p.clone().addScaledVector(tg, 9); }
      if (!camInit || cut) { camPos.copy(desired); camLook.copy(look); camInit = true; }
      camPos.lerp(desired, 1 - Math.pow(0.02, dt)); camLook.lerp(look, 1 - Math.pow(0.005, dt));
      if (camPos.y < GROUND_Y + 2.5) camPos.y = GROUND_Y + 2.5; if (window.__cam) { camPos.set(...window.__cam.pos); camLook.set(...window.__cam.look); } camera.position.copy(camPos); camera.lookAt(camLook);
    }
    // render
    const W = canvas.clientWidth, H = canvas.clientHeight; if (canvas.width !== Math.floor(W * renderer.getPixelRatio()) || canvas.height !== Math.floor(H * renderer.getPixelRatio())) { renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
    if (render) renderer.render(scene, camera);
    // HUD
    const liveSorted = marbles.filter((m) => !m.finished).sort((a, b) => b.prog - a.prog);
    const list = [...order, ...liveSorted].slice(0, placesToShow);
    rows.innerHTML = list.map((m, i) => `<div class="row ${m.finished ? "done" : ""}"><span class="pos">${i + 1}</span><span class="dot" style="background:${m.player.color}"></span><span>${esc(m.player.name)}</span></div>`).join("");
    prog.style.width = `${Math.min(100, 100 * leadProg / (C.finishT * N)).toFixed(1)}%`; left.textContent = live;
    raf = requestAnimationFrame(step);
  }
  window.__track = track; window.__marbles = marbles; window.__world = world; window.__shot = () => shot.name; window.__dbg = () => { const ps = marbles.map((m) => m.prog).sort((a, b) => b - a); const v = marbles[0].body.linvel(); const t = marbles[0].body.translation(); return { resets: marbles.reduce((a, m) => a + (m.resets || 0), 0), jumpResets: marbles.reduce((a, m) => a + (m.jumpResets || 0), 0), started, N, finishAt: Math.round(C.finishT * N), parts: track.parts.map((p) => p.samples.length), simTime: +simTime.toFixed(1), lead: ps[0], median: ps[Math.floor(ps.length / 2)], v0: [v.x, v.y, v.z].map((x) => +x.toFixed(2)), p0: [t.x, t.y, t.z].map((x) => +x.toFixed(1)), fps: Math.round(1 / lastDt) }; };
  let lastDt = 1 / 60;
  raf = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(raf); clearTimeout(commTimer); try { renderer.dispose(); } catch {} }, order: () => order.map((m) => m.player) };
}
