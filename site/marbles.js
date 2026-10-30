/* Roll Call: marble race. Usage:
   const ctl = MARBLES.run(containerEl, { players: [{ id, name, color? }], venue, course?, onFinish(order), onDone() });
   ctl.stop()
   The course is a tall vertical world (COURSE_W wide, COURSE_H tall). Marbles drop from a hopper at the top, the camera
   follows the leading pack, and the finish order is the order marbles cross the line at the bottom. */
(function () {
  const { Engine, Bodies, Body, Composite, Events, Vector } = window.Matter;
  const COURSE_W = 1600, R = 17;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const PALETTE = ["#ff5c5c", "#ffb84d", "#ffe14d", "#7ee2a8", "#5cc8ff", "#b48cff", "#ff8ad8", "#ff9f6e", "#9ef0ff", "#c9f05c", "#f7f7f7", "#ffd23f"];

  const CSS = `
    .mb-wrap{position:relative;width:100%;height:100%;overflow:hidden;background:#0b0f14;font-family:"Inter",system-ui,sans-serif}
    .mb-wrap canvas{position:absolute;inset:0;width:100%;height:100%}
    .mb-hud{position:absolute;inset:0;pointer-events:none}
    .mb-comm{position:absolute;left:3vw;top:3vh;max-width:46vw;background:rgba(0,0,0,.72);color:#fff;border-left:1.2vh solid var(--accent,#ffcd00);padding:1.6vh 2.4vh;font-size:4.2vh;font-weight:800;border-radius:1.2vh;opacity:0;transform:translateY(-1vh);transition:opacity .25s,transform .25s;text-transform:uppercase}
    .mb-comm.on{opacity:1;transform:none}
    .mb-board{position:absolute;right:3vw;top:3vh;background:rgba(0,0,0,.72);border-radius:1.2vh;padding:1.2vh 1.6vh;color:#fff;min-width:22vw}
    .mb-board h3{margin:0 0 .6vh;font-family:"Bebas Neue",Impact,sans-serif;font-size:3.2vh;letter-spacing:.08em;color:var(--accent,#ffcd00)}
    .mb-board .row{display:flex;align-items:center;gap:1.2vh;font-size:2.8vh;font-weight:700;padding:.5vh 0}
    .mb-board .row .pos{width:3.2vh;height:3.2vh;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-size:2vh;font-weight:900}
    .mb-board .row .dot{width:2.6vh;height:2.6vh;border-radius:50%;border:2px solid rgba(255,255,255,.7)}
    .mb-board .row.done .pos{background:var(--accent,#ffcd00)}
    .mb-board .prog{height:1.2vh;background:rgba(255,255,255,.12);border-radius:1vh;margin-top:1vh;overflow:hidden}
    .mb-board .prog i{display:block;height:100%;background:var(--accent,#ffcd00);width:0;transition:width .2s}
    .mb-big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none}
    .mb-big .t{font-family:"Bebas Neue",Impact,sans-serif;font-size:20vh;line-height:1;color:var(--accent,#ffcd00);text-shadow:0 1vh 4vh rgba(0,0,0,.7);animation:mbpop .5s cubic-bezier(.2,1.4,.4,1) both;text-align:center;max-width:90vw}
    .mb-big .s{font-size:4.5vh;font-weight:800;color:#fff;text-shadow:0 .5vh 2vh rgba(0,0,0,.7);margin-top:1vh}
    @keyframes mbpop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
  `;
  function injectCss() { if (!document.getElementById("mb-css")) { const s = document.createElement("style"); s.id = "mb-css"; s.textContent = CSS; document.head.appendChild(s); } }

  // ---------- course builders: return { bodies, spinners, height, finishY, startY } ----------
  function wallsAndFloorless(H) {
    const t = 60;
    return [Bodies.rectangle(-t / 2, H / 2, t, H + 400, { isStatic: true, label: "wall" }), Bodies.rectangle(COURSE_W + t / 2, H / 2, t, H + 400, { isStatic: true, label: "wall" })];
  }
  const ramp = (x, y, len, angleDeg, opts = {}) => Bodies.rectangle(x, y, len, 22, { isStatic: true, angle: angleDeg * Math.PI / 180, chamfer: { radius: 10 }, label: "ramp", ...opts });
  const peg = (x, y, r = 14) => Bodies.circle(x, y, r, { isStatic: true, label: "peg", restitution: 0.4 });
  const spinner = (x, y, len, speed) => { const b = Bodies.rectangle(x, y, len, 18, { isStatic: true, label: "spinner", chamfer: { radius: 8 } }); b.spin = speed; return b; };

  function courseClassic() {
    const H = 9000, B = [], S = [];
    B.push(...wallsAndFloorless(H));
    let y = 650;
    // 1. hopper funnel
    B.push(ramp(330, y, 640, 24), ramp(COURSE_W - 330, y, 640, -24));
    y += 420;
    // 2. plinko field
    for (let row = 0; row < 7; row++) { const off = row % 2 ? 90 : 0; for (let x = 140 + off; x < COURSE_W - 100; x += 180) B.push(peg(x, y + row * 110)); }
    y += 7 * 110 + 120;
    // 3. zigzag ramps
    for (let i = 0; i < 4; i++) { const left = i % 2 === 0; B.push(ramp(left ? 560 : COURSE_W - 560, y, 1150, left ? 14 : -14)); y += 330; }
    // 4. spinner gallery
    y += 60;
    for (let i = 0; i < 3; i++) { const sp = spinner(330 + i * 470, y + (i % 2) * 140, 300, (i % 2 ? -1 : 1) * 0.045); B.push(sp); S.push(sp); }
    y += 420;
    // 5. funnel into a narrow chute with pegs
    B.push(ramp(360, y, 700, 28), ramp(COURSE_W - 360, y, 700, -28));
    y += 480;
    for (let row = 0; row < 4; row++) { const off = row % 2 ? 80 : 0; for (let x = 520 + off; x < COURSE_W - 480; x += 160) B.push(peg(x, y + row * 110, 12)); }
    y += 4 * 110 + 80;
    // 6. wide spinner
    const big = spinner(COURSE_W / 2, y + 120, 620, 0.03); B.push(big); S.push(big);
    y += 420;
    // 7. final zigzag, then the finish line
    for (let i = 0; i < 3; i++) { const left = i % 2 === 1; B.push(ramp(left ? 520 : COURSE_W - 520, y, 1080, left ? 13 : -13)); y += 300; }
    const finishY = y + 260;
    B.push(Bodies.rectangle(COURSE_W / 2, finishY + 420, COURSE_W + 200, 60, { isStatic: true, label: "floor" }));
    return { bodies: B, spinners: S, height: finishY + 500, finishY, startY: 120 };
  }
  const COURSES = { classic: courseClassic };

  function run(container, opts) {
    injectCss();
    const { players = [], venue = {}, onFinish = () => {}, onDone = () => {}, course = "classic", placesToShow = 5 } = opts;
    const accent = venue.color_accent || "#ffcd00";
    container.innerHTML = `<div class="mb-wrap" style="--accent:${accent}"><canvas></canvas>
      <div class="mb-hud"><div class="mb-comm"></div><div class="mb-board"><h3>Roll Call</h3><div class="rows"></div><div class="prog"><i></i></div></div><div class="mb-big"></div></div></div>`;
    const canvas = container.querySelector("canvas"), ctx = canvas.getContext("2d");
    const comm = container.querySelector(".mb-comm"), rows = container.querySelector(".mb-board .rows"), prog = container.querySelector(".mb-board .prog i"), big = container.querySelector(".mb-big");
    const audio = (n, d) => { try { if (window.AUDIO) window.AUDIO.event(n, d); } catch {} };
    let commTimer = null; const say = (t, ms = 2200) => { comm.textContent = t; comm.classList.add("on"); clearTimeout(commTimer); commTimer = setTimeout(() => comm.classList.remove("on"), ms); };

    const engine = Engine.create({ gravity: { x: 0, y: 1.15 } });
    engine.timing.timeScale = 1;
    const world = engine.world;
    const C = (COURSES[course] || courseClassic)();
    Composite.add(world, C.bodies);

    // marbles: packed into a hopper above the funnel, released by a gate
    const n = Math.max(1, players.length);
    const cols = Math.min(28, Math.ceil(Math.sqrt(n * 2.2)));
    const marbles = players.map((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = COURSE_W / 2 + (col - cols / 2 + 0.5) * (R * 2.2) + rnd(-3, 3), y = C.startY + 260 - row * (R * 2.1);
      const b = Bodies.circle(x, y, R, { restitution: 0.3, friction: 0.01, frictionAir: 0.003, density: 0.004, label: "marble" });
      b.player = { ...p, color: p.color || PALETTE[i % PALETTE.length] }; b.finished = false;
      return b;
    });
    Composite.add(world, marbles);
    const gate = Bodies.rectangle(COURSE_W / 2, C.startY + 300, 900, 30, { isStatic: true, label: "gate" });
    Composite.add(world, gate);

    const order = []; let finished = false, stopped = false, raf, last = performance.now(), started = false, startAt = 0;
    let camY = 0, camX, camScale = 0.7, winnerShown = false;
    const first = (p) => String(p.name || "").trim().split(/\s+/)[0] || "?";

    function release() { Composite.remove(world, gate); started = true; startAt = performance.now(); say("And away they go!"); audio("go"); }
    setTimeout(release, 1200);

    Events.on(engine, "beforeUpdate", () => {
      C.spinners.forEach((s) => Body.setAngle(s, s.angle + s.spin));
      // nudge marbles that stall on a flat spot
      marbles.forEach((m) => { if (!m.finished && started && Math.abs(m.velocity.x) < 0.05 && Math.abs(m.velocity.y) < 0.05) Body.applyForce(m, m.position, { x: rnd(-0.0006, 0.0006), y: 0 }); });
    });

    function step(now) {
      if (stopped) return;
      const dt = Math.min(32, now - last); last = now;
      Engine.update(engine, dt);
      // finish detection
      for (const m of marbles) {
        if (!m.finished && m.position.y > C.finishY) {
          m.finished = true; order.push(m);
          if (order.length === 1) { say(`${first(m.player)} takes it!`, 3500); audio("finish", { racer: "marble" }); onFinish([...order]); winnerShown = true;
            big.innerHTML = `<div class="t">${esc(first(m.player).toUpperCase())} WINS!</div><div class="s">${esc(m.player.name)}</div>`; }
          else if (order.length <= 3) say(`${first(m.player)} in ${["", "first", "second", "third"][order.length]}!`);
        }
      }
      if (order.length === 1 && !finished) { finished = true; setTimeout(() => { if (!stopped) onDone([...order]); }, 5200); }
      draw(now); updateBoard();
      raf = requestAnimationFrame(step);
    }

    function updateBoard() {
      const live = marbles.filter((m) => !m.finished).sort((a, b) => b.position.y - a.position.y);
      const list = [...order, ...live].slice(0, placesToShow);
      rows.innerHTML = list.map((m, i) => `<div class="row ${m.finished ? "done" : ""}"><span class="pos">${i + 1}</span><span class="dot" style="background:${m.player.color}"></span><span>${esc(m.player.name)}</span></div>`).join("");
      const lead = Math.max(0, ...marbles.map((m) => m.position.y)); prog.style.width = `${Math.min(100, 100 * (lead - C.startY) / (C.finishY - C.startY)).toFixed(1)}%`;
    }

    function draw(now) {
      const W = canvas.clientWidth, H = canvas.clientHeight; if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      // camera: follow the leading pack (85th percentile of y), zoom so the course width fits with margin
      const live = marbles.filter((m) => !m.finished);
      const ys = live.map((m) => m.position.y).sort((a, b) => a - b), xs = live.map((m) => m.position.x);
      const target = ys.length ? ys[Math.floor(ys.length * 0.85)] : C.finishY;
      // view height in world units: show about 1150px of course, scale from that; horizontal centre follows the pack
      const viewH = 1150; const sc = H / viewH; camScale += (sc - camScale) * 0.1;
      const viewW = W / camScale; const cx = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : COURSE_W / 2;
      const tx = Math.max(0, Math.min(COURSE_W - viewW, cx - viewW / 2));
      if (camX === undefined) camX = tx; camX += (tx - camX) * 0.05;
      if (viewW >= COURSE_W) camX = (COURSE_W - viewW) / 2;
      camY += ((target - viewH * 0.55) - camY) * 0.06;
      camY = Math.max(0, Math.min(C.height - viewH, camY));
      ctx.fillStyle = "#0e1a2b"; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.scale(camScale, camScale); ctx.translate(-camX, -camY);
      // course background
      ctx.fillStyle = "#13233a"; ctx.fillRect(0, camY - 50, COURSE_W, viewH + 100);
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 2;
      for (let y = Math.floor(camY / 200) * 200; y < camY + viewH; y += 200) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(COURSE_W, y); ctx.stroke(); }
      ctx.fillStyle = "#1c3350"; ctx.fillRect(-60, camY - 50, 60, viewH + 100); ctx.fillRect(COURSE_W, camY - 50, 60, viewH + 100);
      // finish line
      const fy = C.finishY, sq = 28; for (let x = 0; x < COURSE_W; x += sq) for (let k = 0; k < 2; k++) { ctx.fillStyle = ((x / sq + k) % 2) ? "#fff" : "#111"; ctx.fillRect(x, fy + k * sq, sq, sq); }
      ctx.fillStyle = accent; ctx.font = "900 60px 'Bebas Neue', Impact, sans-serif"; ctx.textAlign = "center"; ctx.fillText("FINISH", COURSE_W / 2, fy - 30);
      // statics
      for (const b of C.bodies.concat(started ? [] : [gate])) {
        if (b.label === "wall") continue;
        ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
        if (b.label === "peg") { ctx.fillStyle = "#e8eef7"; ctx.beginPath(); ctx.arc(0, 0, b.circleRadius, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(3, 3, b.circleRadius * 0.6, 0, Math.PI * 2); ctx.fill(); }
        else {
          ctx.restore(); ctx.save();
          ctx.fillStyle = b.label === "spinner" ? accent : b.label === "gate" ? "#ff5c5c" : b.label === "floor" ? "#0b0f14" : "#d9e2f1";
          ctx.beginPath(); b.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); ctx.closePath(); ctx.fill();
          if (b.label === "ramp") { ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 3; ctx.stroke(); }
          if (b.label === "spinner") { ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 12, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
      }
      // marbles (drawn last; finished ones fade)
      ctx.font = "800 18px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const m of marbles) {
        if (m.finished && m.position.y > C.finishY + 400) continue;
        const { x, y } = m.position;
        const g = ctx.createRadialGradient(x - 6, y - 6, 3, x, y, R); g.addColorStop(0, "#fff"); g.addColorStop(0.25, m.player.color); g.addColorStop(1, "#000");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3; const label = first(m.player).slice(0, 9);
        ctx.strokeText(label, x, y - R - 12); ctx.fillText(label, x, y - R - 12);
      }
      ctx.restore();
    }
    say("Marbles are set. Gate opens in 3...", 1200);
    raf = requestAnimationFrame(step);
    return { stop() { stopped = true; cancelAnimationFrame(raf); clearTimeout(commTimer); }, order: () => order.map((m) => m.player) };
  }
  window.MARBLES = { run, COURSES: Object.keys(COURSES) };
})();
