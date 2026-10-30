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
`;
function injectCss() { if (!document.getElementById("bm-css")) { const s = document.createElement("style"); s.id = "bm-css"; s.textContent = CSS; document.head.appendChild(s); } }

// ---------- courses: a list of 3D control points, start first, finish last (descending) ----------
function helix(cx, cz, r, y0, y1, turns, n, startAngle = 0, dir = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = startAngle + dir * t * turns * Math.PI * 2; out.push(new THREE.Vector3(cx + Math.cos(a) * r, y0 + (y1 - y0) * t, cz + Math.sin(a) * r)); }
  return out;
}
const COURSES = {
  classic() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const P = [
      // opening run: a ramp with two sweeping bends
      V(0, 92, 0), V(0, 90, 10), V(1, 85, 24), V(8, 79, 38), V(24, 74, 48), V(42, 70, 44), V(52, 66, 28), V(46, 62, 12), V(34, 60, 2),
    ];
    // spiral: enters heading -x at (10,57,0), 1.75 turns around (10,-16), exits heading +z at (26,30,-16)
    P.push(...helix(10, -16, 16, 57, 30, 1.75, 30, Math.PI / 2, 1));
    // big sweep back across the course, then a chicane and the finish straight
    P.push(V(28, 27, 4), V(18, 24, 24), V(-6, 21, 34), V(-34, 18, 30), V(-58, 15, 14), V(-66, 12, -10), V(-54, 9, -28), V(-30, 7, -34), V(-6, 5.5, -28), V(10, 4, -16), V(26, 3, -24), V(44, 2, -30), V(66, 0.5, -30), V(86, -1, -30));
    return { points: P, finishT: 0.985, name: "Classic" };
  },
};
export const COURSE_NAMES = Object.keys(COURSES);

// Build a half-pipe mesh + trimesh collider along a Catmull-Rom spline.
function buildTrack(points, accent) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
  const N = 800, SEG = 14;
  const samples = curve.getSpacedPoints(N), tangents = [];
  // never let the track climb: a spline between control points can bulge upward and make a dip that traps marbles
  const MIN_DROP = 0.035;
  for (let i = 1; i <= N; i++) if (samples[i].y > samples[i - 1].y - MIN_DROP) samples[i].y = samples[i - 1].y - MIN_DROP;
  // smooth the corrected heights a little so the fix doesn't leave kinks
  for (let k = 0; k < 3; k++) for (let i = 1; i < N; i++) samples[i].y = Math.min(samples[i].y, (samples[i - 1].y + samples[i].y + samples[i + 1].y) / 3);
  const frames = []; const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize(); tangents.push(t);
    let side = new THREE.Vector3().crossVectors(t, up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
    let down = new THREE.Vector3().crossVectors(t, side).normalize(); if (down.y > 0) { down.negate(); side.negate(); }
    frames.push({ side, down });
  }
  // bank on curves: rotate the section around the tangent proportionally to lateral curvature
  const bank = new Array(N + 1).fill(0);
  for (let i = 2; i < N - 1; i++) { const a = tangents[i - 2], b = tangents[i + 1]; const cross = new THREE.Vector3().crossVectors(a, b); bank[i] = THREE.MathUtils.clamp(-cross.y * 14, -0.55, 0.55); }
  for (let k = 0; k < 6; k++) for (let i = 1; i < N; i++) bank[i] = (bank[i - 1] + bank[i] + bank[i + 1]) / 3;
  const pos = [], uvs = [], idx = [];
  const arc = THREE.MathUtils.degToRad(PIPE_ARC);
  for (let i = 0; i <= N; i++) {
    const c = samples[i], { side, down } = frames[i], t = tangents[i];
    const q = new THREE.Quaternion().setFromAxisAngle(t, bank[i]);
    const S = side.clone().applyQuaternion(q), D = down.clone().applyQuaternion(q);
    for (let j = 0; j <= SEG; j++) {
      const th = -arc + (2 * arc) * (j / SEG);
      const p = c.clone().addScaledVector(S, Math.sin(th) * PIPE_R).addScaledVector(D, Math.cos(th) * PIPE_R);
      pos.push(p.x, p.y, p.z); uvs.push(i / N * 60, j / SEG);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  { // normals must point into the pipe (up at the bottom of the trough) so the running surface is lit
    const nrm = geo.attributes.normal, mid = Math.floor(SEG / 2); if (nrm.getY(10 * (SEG + 1) + mid) < 0) { for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); nrm.needsUpdate = true; }
  }
  // stripe texture
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const g = cv.getContext("2d");
  g.fillStyle = "#dfe6f2"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#b9c4d8"; g.fillRect(0, 0, 256, 7); g.fillRect(0, 57, 256, 7);
  g.fillStyle = "#cfd8e8"; for (let x = 0; x < 256; x += 32) g.fillRect(x, 7, 2, 50);
  g.fillStyle = accent; g.fillRect(0, 30, 256, 4);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.FrontSide, roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
  // outer shell for a solid look
  const shellGeo = geo.clone(); { const n = shellGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0x4a5b80, side: THREE.BackSide, roughness: 0.9 }));
  return { curve, samples, tangents, frames, mesh, shell, vertices: new Float32Array(pos), indices: new Uint32Array(idx) };
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
  container.innerHTML = `<div class="bm-wrap" style="--accent:${accent}"><canvas></canvas><div class="bm-hud"><div class="bm-comm"></div><div class="bm-board"><h3>Bar Marbles</h3><div class="rows"></div><div class="prog"><i></i></div></div><div class="bm-count"><b id="bmLeft">0</b> still rolling</div><div class="bm-big"></div></div></div>`;
  const canvas = container.querySelector("canvas"), comm = container.querySelector(".bm-comm"), rows = container.querySelector(".bm-board .rows"), prog = container.querySelector(".bm-board .prog i"), big = container.querySelector(".bm-big"), left = container.querySelector("#bmLeft");
  const audio = (n, d) => { try { if (window.AUDIO) window.AUDIO.event(n, d); } catch {} };
  let commTimer = null; const say = (t, ms = 2200) => { comm.textContent = t; comm.classList.add("on"); clearTimeout(commTimer); commTimer = setTimeout(() => comm.classList.remove("on"), ms); };

  // ---- three ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const skyTop = new THREE.Color(venue.color_primary || "#0f2a3a").lerp(new THREE.Color("#6fb6ff"), 0.55), skyBot = new THREE.Color("#e9f2ff");
  { const cv = document.createElement("canvas"); cv.width = 2; cv.height = 256; const g = cv.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#" + skyTop.getHexString()); gr.addColorStop(1, "#" + skyBot.getHexString()); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.fog = new THREE.Fog(skyBot, 150, 320);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9bb8, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6); sun.position.set(60, 120, 40); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 1, far: 400 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: new THREE.Color(venue.color_primary || "#0f2a3a").lerp(new THREE.Color("#8fa5c4"), 0.5), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -6; ground.receiveShadow = true; scene.add(ground);

  const C = (COURSES[course] || COURSES.classic)();
  const track = buildTrack(C.points, accent); scene.add(track.mesh); scene.add(track.shell);
  // support pillars every so often
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x9fb0cc, roughness: 0.9 });
  for (let i = 25; i < track.samples.length; i += 40) { const p = track.samples[i]; const h = p.y + 6 - PIPE_R; if (h > 2) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, h, 10), pillarMat); m.position.set(p.x, -6 + h / 2, p.z); m.castShadow = true; scene.add(m); } }
  // finish arch + checkered band
  const fi = Math.floor(C.finishT * (track.samples.length - 1)), fp = track.samples[fi], ft = track.tangents[fi], ff = track.frames[fi];
  { const arch = new THREE.Group(); const post = new THREE.CylinderGeometry(0.3, 0.3, 8, 10), pm = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(post, pm); m.position.copy(fp).addScaledVector(ff.side, s * (PIPE_R + 0.6)).add(new THREE.Vector3(0, 2, 0)); arch.add(m); }
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const g = cv.getContext("2d"); for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * 16, y * 16, 16, 16); }
    const bt = new THREE.CanvasTexture(cv); const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * PIPE_R + 1.8, 1.2, 0.3), new THREE.MeshStandardMaterial({ map: bt })); banner.position.copy(fp).add(new THREE.Vector3(0, 6, 0)); banner.lookAt(banner.position.clone().add(ft)); arch.add(banner);
    scene.add(arch); }

  // ---- physics ----
  const world = new RAPIER.World({ x: 0, y: -26, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.trimesh(track.vertices, track.indices).setFriction(0.12).setRestitution(0.1));
  world.createCollider(RAPIER.ColliderDesc.cuboid(400, 1, 400).setTranslation(0, -7, 0));
  // start pen: marbles stacked in the pipe behind a gate
  const s0 = track.samples[0], t0 = track.tangents[0], f0 = track.frames[0];
  const gateI = 60, gp = track.samples[gateI], gt = track.tangents[gateI];
  const gate = world.createCollider(RAPIER.ColliderDesc.cuboid(PIPE_R + 0.5, PIPE_R, 0.25).setTranslation(gp.x, gp.y, gp.z).setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), gt)));
  const gateMesh = new THREE.Mesh(new THREE.BoxGeometry(2 * PIPE_R + 1, 2 * PIPE_R, 0.5), new THREE.MeshStandardMaterial({ color: 0xff4d4d })); gateMesh.position.copy(gp); gateMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gt); scene.add(gateMesh);

  const ballGeo = new THREE.SphereGeometry(BALL_R, 20, 14);
  const marbles = players.map((p, i) => {
    const color = p.color || PALETTE[i % PALETTE.length];
    const perRow = 4, row = Math.floor(i / perRow), col = i % perRow;
    const si = Math.max(2, gateI - 3 - row * 3), c = track.samples[si], fr = track.frames[si];
    const pos = c.clone().addScaledVector(fr.side, (col - (perRow - 1) / 2) * (BALL_R * 2.05)).addScaledVector(fr.down, PIPE_R - BALL_R - 0.15).add(new THREE.Vector3(0, 0.2 + (row % 3) * 0.1, 0));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinearDamping(0.01).setAngularDamping(0.2).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(1.2).setFriction(0.12).setRestitution(0.2), body);
    const mesh = new THREE.Mesh(ballGeo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.2, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 })); mesh.castShadow = true; scene.add(mesh);
    const label = i < maxLabels ? makeLabel(first(p).slice(0, 10), color) : null; if (label) scene.add(label);
    return { player: { ...p, color }, body, mesh, label, hint: si, prog: si, finished: false, stillFor: 0 };
  });

  // ---- state ----
  const order = []; let started = false, stopped = false, finishedFlag = false, raf, last = performance.now(), acc = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camInit = false;
  const N = track.samples.length - 1;
  function progressOf(m) {
    const p = m.body.translation(); let best = m.hint, bd = Infinity;
    for (let i = Math.max(0, m.hint - 25); i <= Math.min(N, m.hint + 60); i++) { const s = track.samples[i]; const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    m.hint = best; return best;
  }
  function release() { world.removeCollider(gate, false); scene.remove(gateMesh); started = true; say("And away they go!"); audio("go"); }
  let releaseAt = 1.5;
  say("Marbles are set. Gate opens in 3...", 1400);

  function step(now) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt; lastDt = dt || lastDt;
    if (!started && simTime >= releaseAt) release();
    let steps = 0; while (acc >= 1 / 60 && steps < maxStepsPerFrame) { world.step(); acc -= 1 / 60; simTime += 1 / 60; steps++; } if (acc > 0.25) acc = 0;
    let leader = null, leadProg = -1, live = 0;
    for (const m of marbles) {
      const t = m.body.translation(); m.mesh.position.set(t.x, t.y, t.z); const r = m.body.rotation(); m.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (m.label) m.label.position.set(t.x, t.y + BALL_R + 0.75, t.z);
      if (m.finished) continue;
      live++;
      m.prog = progressOf(m);
      if (m.prog > leadProg) { leadProg = m.prog; leader = m; }
      // fell off the course: put it back on the track at its last progress point
      if (t.y < -4 || (started && m.prog < N && (() => { const s = track.samples[m.prog]; return (s.x - t.x) ** 2 + (s.y - t.y) ** 2 + (s.z - t.z) ** 2 > 36; })())) {
        const s = track.samples[Math.max(0, m.prog - 2)]; m.body.setTranslation({ x: s.x, y: s.y + 0.5, z: s.z }, true); m.body.setLinvel({ x: 0, y: 0, z: 0 }, true); m.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
    if (order.length >= 1 && !finishedFlag) { finishedFlag = true; setTimeout(() => { if (!stopped) onDone(order.map((x) => x.player)); }, 6000); }
    // camera: chase the leader (or the finish once someone has won)
    const focus = leader || order[order.length - 1];
    if (focus) {
      const p = focus.body.translation(), tg = track.tangents[focus.prog];
      const desired = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(tg, -19).add(new THREE.Vector3(0, 10, 0));
      const look = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(tg, 10);
      if (!camInit) { camPos.copy(desired); camLook.copy(look); camInit = true; }
      camPos.lerp(desired, 1 - Math.pow(0.02, dt)); camLook.lerp(look, 1 - Math.pow(0.01, dt));
      camera.position.copy(camPos); camera.lookAt(camLook);
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
  window.__dbg = () => { const ps = marbles.map((m) => m.prog).sort((a, b) => b - a); const v = marbles[0].body.linvel(); const t = marbles[0].body.translation(); return { started, simTime: +simTime.toFixed(1), lead: ps[0], median: ps[Math.floor(ps.length / 2)], v0: [v.x, v.y, v.z].map((x) => +x.toFixed(2)), p0: [t.x, t.y, t.z].map((x) => +x.toFixed(1)), fps: Math.round(1 / lastDt) }; };
  let lastDt = 1 / 60;
  raf = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(raf); clearTimeout(commTimer); try { renderer.dispose(); } catch {} }, order: () => order.map((m) => m.player) };
}
