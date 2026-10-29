/* Stadium mascot race. Usage:
   const ctl = RACE.run(containerEl, { racers, winnerId, venue, onDone });  ctl.stop()
   racers: [{ id, label, emoji, image_url? }]  (image_url = optional uploaded artwork used instead of the vector mascot) */
(function () {
  const W = 1920, H = 1080, L = 7600, START = 420, FINISH = L - 520;
  const STANDS_H = 390, TRACK_Y = 410;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, t) => a + (b - a) * t;

  const CSS = `
    .race-wrap{position:relative;width:100%;height:100%;overflow:hidden;background:#0b0f14;font-family:"Inter",system-ui,sans-serif}
    .race-wrap svg.world{position:absolute;inset:0;width:100%;height:100%}
    .race-hud{position:absolute;inset:0;pointer-events:none}
    .race-comm{position:absolute;left:3vw;top:3vh;max-width:46vw;background:rgba(0,0,0,.72);color:#fff;border-left:1.2vh solid var(--accent,#ffcd00);padding:1.6vh 2.4vh;font-size:4.2vh;font-weight:800;letter-spacing:.01em;border-radius:1.2vh;opacity:0;transform:translateY(-1vh);transition:opacity .25s,transform .25s;text-transform:uppercase}
    .race-comm.on{opacity:1;transform:none}
    .race-board{position:absolute;right:3vw;top:3vh;background:rgba(0,0,0,.72);border-radius:1.2vh;padding:1.2vh 1.6vh;color:#fff;min-width:22vw}
    .race-board .row{display:flex;align-items:center;gap:1.2vh;font-size:2.8vh;font-weight:700;padding:.5vh 0;transition:transform .3s}
    .race-board .row .pos{width:3.2vh;height:3.2vh;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-size:2vh;font-weight:900}
    .race-board .row:first-child .pos{background:var(--accent,#ffcd00)}
    .race-board .row .ico{width:4vh;height:4.6vh;display:flex;align-items:flex-end}
    .race-board .row .ico svg,.race-board .row .ico img{height:100%;width:auto}
    .race-board .row .gap{margin-left:auto;font-weight:500;opacity:.7;font-size:2.2vh;font-variant-numeric:tabular-nums}
    .race-strip{position:absolute;left:3vw;right:3vw;bottom:2.2vh;height:5.5vh;background:rgba(0,0,0,.6);border-radius:3vh;border:2px solid rgba(255,255,255,.25)}
    .race-strip .dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:4.8vh;height:4.8vh;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 .4vh 1vh rgba(0,0,0,.4);transition:left .12s linear}
    .race-strip .dot svg,.race-strip .dot img{height:88%;width:auto;margin-top:.6vh}
    .race-strip .flag{position:absolute;right:1.2vh;top:50%;transform:translateY(-50%);font-size:3.4vh}
    .race-big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1vh;pointer-events:none}
    .race-big .t{font-family:"Bebas Neue","Oswald",Impact,sans-serif;font-size:20vh;line-height:1;text-align:center;max-width:90vw;color:var(--accent,#ffcd00);text-shadow:0 1vh 4vh rgba(0,0,0,.7);animation:racepop .5s cubic-bezier(.2,1.4,.4,1) both}
    .race-big .s{font-size:5vh;font-weight:800;color:#fff;text-shadow:0 .5vh 2vh rgba(0,0,0,.7);text-transform:uppercase;letter-spacing:.05em}
    .race-photo{position:absolute;left:50%;top:14vh;transform:translateX(-50%);background:#fff;color:#111;font-weight:900;font-size:4vh;padding:1vh 3vh;border-radius:1vh;letter-spacing:.15em;animation:raceblink .5s steps(2) infinite}
    @keyframes racepop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes raceblink{to{opacity:.4}}
  `;

  function injectCss() { if (!document.getElementById("race-css")) { const s = document.createElement("style"); s.id = "race-css"; s.textContent = CSS; document.head.appendChild(s); } }

  function racerArt(r, height) {
    if (r.icon_url) return `<img src="${esc(r.icon_url)}" alt="">`;
    if (r.image_url) return `<img src="${esc(r.image_url)}" alt="">`;
    return window.MASCOTS.standalone(r.id, height, { emoji: r.emoji });
  }

  // Build an actor (el + set(mode) + tick(dt, speed)) for a racer: sprite sheet, uploaded still, or vector mascot.
  async function makeActor(r) {
    if (r.sprite_url) { try { return await window.SPRITES.actor(r.sprite_url); } catch (e) { console.warn(e); } }
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    if (r.image_url) {
      g.innerHTML = `<image href="${esc(r.image_url)}" x="0" y="0" width="200" height="240" preserveAspectRatio="xMidYMax meet"/>`;
      let mode = "idle", t = 0;
      return { el: g, ready: true, stumbleMs: 900, set(m) { mode = m; }, tick(dt, speed = 1) { t += dt; const dy = mode === "run" ? -Math.abs(Math.sin(t * 9 * speed)) * 12 : mode === "win" ? -Math.abs(Math.sin(t * 7)) * 34 : 0; const rot = mode === "run" ? 8 : mode === "stumble" ? 35 : 0; g.setAttribute("transform", `translate(0 ${dy}) rotate(${rot} 100 240)`); } };
    }
    g.innerHTML = window.MASCOTS.markup(r.id, { emoji: r.emoji });
    return window.SPRITES.vectorActor(g.querySelector(".mascot"));
  }

  function buildWorld(racers, venue) {
    const n = racers.length, laneH = (H - TRACK_Y - 30) / n;
    const accent = venue.color_accent || "#ffcd00", primary = venue.color_primary || "#1a3a4a";
    // ----- crowd -----
    const fanColors = [accent, "#ffffff", "#f3f3f3", primary, "#e63946", "#2a9d8f", "#f4a261", "#8ecae6", "#222"];
    let crowd = "", fans = [];
    const rows = 4;
    for (let row = 0; row < rows; row++) {
      const y = 120 + row * 62, scale = 0.8 + row * 0.08;
      for (let x = -200; x < L + 400; x += 44 + rnd(0, 10)) {
        const c = pick(fanColors), skin = pick(["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"]), jump = Math.random() < 0.18;
        const id = jump ? ` class="fan" data-ph="${rnd(0, 6.28).toFixed(2)}" data-amp="${rnd(8, 18).toFixed(0)}"` : "";
        crowd += `<g${id} transform="translate(${x.toFixed(0)} ${y}) scale(${scale})"><rect x="-13" y="14" width="26" height="30" rx="8" fill="${c}"/><circle cx="0" cy="4" r="12" fill="${skin}"/>${Math.random() < 0.3 ? `<path d="M-12 2 a12 12 0 0 1 24 0z" fill="${pick(fanColors)}"/>` : ""}</g>`;
      }
    }
    // ----- track -----
    let lanes = "";
    for (let i = 0; i < n; i++) {
      const y = TRACK_Y + i * laneH;
      lanes += `<rect x="-200" y="${y}" width="${L + 400}" height="${laneH}" fill="${i % 2 ? "#b4523a" : "#bf5a40"}"/>`;
      lanes += `<line x1="-200" y1="${y + laneH}" x2="${L + 400}" y2="${y + laneH}" stroke="#fff" stroke-width="5" opacity=".85"/>`;
      lanes += `<text x="${START - 60}" y="${y + laneH * 0.62}" font-size="${laneH * 0.45}" font-weight="900" fill="#fff" opacity=".5" text-anchor="end" font-family="Inter,sans-serif">${i + 1}</text>`;
    }
    // distance ticks
    let ticks = "";
    for (let x = START + 500; x < FINISH; x += 500) ticks += `<line x1="${x}" y1="${TRACK_Y}" x2="${x}" y2="${H}" stroke="#fff" stroke-width="3" opacity=".18" stroke-dasharray="20 18"/>`;
    // finish line
    let checks = "";
    const sq = 22;
    for (let yy = TRACK_Y - 10; yy < H; yy += sq) for (let k = 0; k < 3; k++) checks += `<rect x="${FINISH + k * sq}" y="${yy}" width="${sq}" height="${sq}" fill="${((yy / sq | 0) + k) % 2 ? "#fff" : "#111"}"/>`;
    const gantry = `<g><rect x="${FINISH - 80}" y="${TRACK_Y - 250}" width="40" height="260" fill="#333"/><rect x="${FINISH + 110}" y="${TRACK_Y - 250}" width="40" height="260" fill="#333"/>
      <rect x="${FINISH - 120}" y="${TRACK_Y - 300}" width="310" height="90" rx="8" fill="#111" stroke="${accent}" stroke-width="6"/>
      <text x="${FINISH + 35}" y="${TRACK_Y - 232}" font-size="64" font-weight="900" fill="${accent}" text-anchor="middle" font-family="Bebas Neue,Impact,sans-serif" letter-spacing="4">FINISH</text></g>`;
    // start blocks + line
    const startLine = `<rect x="${START - 6}" y="${TRACK_Y}" width="12" height="${H - TRACK_Y}" fill="#fff" opacity=".9"/>`;
    // banner text along the stands
    let banner = "";
    for (let x = 0; x < L; x += 900) banner += `<text x="${x + 60}" y="${STANDS_H - 22}" font-size="40" font-weight="900" fill="${accent}" font-family="Bebas Neue,Impact,sans-serif" letter-spacing="6" opacity=".9">${esc((venue.name || "LAST CALL GAMES").toUpperCase())}</text>`;

    return { laneH, svg: `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="#0b0f14"/></linearGradient>
        <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f38"/><stop offset="1" stop-color="#14181f"/></linearGradient>
        ${window.MASCOTS.DEFS.replace(/<\/?defs>/g, "")}
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
      <g class="layer-stands">
        <rect x="-400" y="40" width="${L + 800}" height="${STANDS_H - 40}" fill="#1d222b"/>
        <rect x="-400" y="40" width="${L + 800}" height="30" fill="url(#roof)"/>
        <g class="crowd">${crowd}</g>
        <rect x="-400" y="${STANDS_H - 70}" width="${L + 800}" height="70" fill="#262c36"/>
        ${banner}
        <rect x="-400" y="${STANDS_H}" width="${L + 800}" height="${TRACK_Y - STANDS_H}" fill="#3f7d3a"/>
      </g>
      <g class="layer-track">${lanes}${ticks}${startLine}${checks}${gantry}</g>
      <g class="layer-racers"></g>` };
  }

  function run(container, opts) {
    injectCss();
    const { racers, winnerId, venue = {}, onDone = () => {}, duration = 15000 } = opts;
    const n = racers.length;
    container.innerHTML = `<div class="race-wrap" style="--accent:${venue.color_accent || "#ffcd00"}">
      <svg class="world" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"></svg>
      <div class="race-hud"><div class="race-comm"></div><div class="race-board"></div><div class="race-strip"><span class="flag">🏁</span></div><div class="race-big"></div></div></div>`;
    const svg = container.querySelector("svg.world"), comm = container.querySelector(".race-comm"), board = container.querySelector(".race-board"), strip = container.querySelector(".race-strip"), big = container.querySelector(".race-big");
    const world = buildWorld(racers, venue);
    svg.innerHTML = world.svg;
    const stands = svg.querySelector(".layer-stands"), track = svg.querySelector(".layer-track"), racerLayer = svg.querySelector(".layer-racers");
    const fans = Array.from(svg.querySelectorAll(".fan")).map((el) => ({ el, base: el.getAttribute("transform"), ph: +el.dataset.ph, amp: +el.dataset.amp }));

    // racer elements (actors are built asynchronously, the race starts once all are ready)
    const scale = (world.laneH * 0.92) / 240;
    const R = racers.map((r, i) => {
      const laneY = TRACK_Y + i * world.laneH + world.laneH - 14;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.innerHTML = `<ellipse class="shadow" cx="100" cy="238" rx="80" ry="14" fill="#000" opacity=".3"/>`;
      racerLayer.appendChild(g);
      return { ...r, i, g, actor: null, laneY, p: 0, v: 1, mode: "idle", burstUntil: 0, burst: 1, stumbleUntil: 0, boosts: [] };
    });
    const winner = R.find((r) => r.id === winnerId) || R[0];

    // drama script: two non-winners lead early, one stumbles, winner surges late
    const others = R.filter((r) => r !== winner).sort(() => Math.random() - 0.5);
    if (others[0]) others[0].boosts.push([0.12, 0.38, 1.22]);
    if (others[1]) others[1].boosts.push([0.42, 0.68, 1.24]);
    if (others[2]) others[2].boosts.push([0.2, 0.3, 1.15], [0.6, 0.72, 1.18]);
    winner.boosts.push([0.0, 0.1, 1.1], [0.74, 1.0, 1.42]);
    const stumbler = others.length ? pick(others) : null, stumbleAt = rnd(0.28, 0.6);
    let stumbled = false;

    // HUD setup
    board.innerHTML = R.map((r) => `<div class="row" data-id="${esc(r.id)}"><span class="pos">1</span><span class="ico">${racerArt(r, 46)}</span><span>${esc(r.label)}</span><span class="gap"></span></div>`).join("");
    strip.innerHTML += R.map((r) => `<div class="dot" data-id="${esc(r.id)}" style="left:0">${racerArt(r, 40)}</div>`).join("");
    const boardRows = Object.fromEntries(Array.from(board.children).map((el) => [el.dataset.id, el]));
    const dots = Object.fromEntries(Array.from(strip.querySelectorAll(".dot")).map((el) => [el.dataset.id, el]));

    let commTimer = null;
    const say = (text, ms = 2200) => { comm.textContent = text; comm.classList.add("on"); clearTimeout(commTimer); commTimer = setTimeout(() => comm.classList.remove("on"), ms); };

    const xOf = (r) => START + r.p * (FINISH - START);
    const place = (r) => { r.g.setAttribute("transform", `translate(${xOf(r) - 100 * scale} ${r.laneY - 240 * scale}) scale(${scale})`); };
    let camX = 0, lastLeader = null, lastLeadSay = 0, slow = false, photoShown = false, finished = false, raf = 0, stopped = false;
    const t0 = performance.now(); let last = t0, raceStart = 0, phaseT = "count";
    const countdown = ["ON YOUR MARKS", "GET SET", "GO!"];
    let countIdx = 0, countNext = t0 + 200;

    function frame(now) {
      if (stopped) return;
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      // ---- countdown ----
      if (phaseT === "count") {
        if (now >= countNext) {
          if (countIdx < countdown.length) { big.innerHTML = `<div class="t" style="font-size:${countIdx === 2 ? 34 : 16}vh">${countdown[countIdx]}</div>`; countNext = now + (countIdx === 2 ? 700 : 1300); countIdx++; }
          else { big.innerHTML = ""; phaseT = "race"; raceStart = now; R.forEach((r) => (r.mode = "run")); say("And they're off!"); }
        }
        R.forEach((r) => { r.actor.set("idle"); r.actor.tick(dt, 1); place(r); });
        raf = requestAnimationFrame(frame); return;
      }
      // ---- race ----
      const T = Math.min(1.2, (now - raceStart) / duration);
      if (slow) dt *= 0.32;
      const leaderP = Math.max(...R.map((r) => r.p));
      R.forEach((r) => {
        if (r.mode === "win" || r.mode === "done") return;
        if (now > r.burstUntil) { r.burst = rnd(0.82, 1.18); r.burstUntil = now + rnd(400, 900); }
        let f = r.burst;
        r.boosts.forEach(([a, b, k]) => { if (T >= a && T <= b) f *= k; });
        if (r !== winner && r.p < leaderP - 0.1) f *= 1.15;               // pack stays together
        if (r === stumbler && !stumbled && T >= stumbleAt) { stumbled = true; r.stumbleUntil = now + r.actor.stumbleMs; say(`${r.label} goes down!`); }
        if (now < r.stumbleUntil) { f *= 0.1; r.mode = "stumble"; } else if (r.mode === "stumble") r.mode = "run";
        r.v = f;
        r.p += (f / (duration / 1000)) * dt;
        if (r !== winner) { if (T > 0.82) r.p = Math.min(r.p, winner.p - 0.012 - 0.006 * r.i); r.p = Math.min(r.p, 0.995); }
      });
      // photo finish / slow-mo
      if (!slow && winner.p > 0.9) {
        slow = true;
        const second = Math.max(...R.filter((r) => r !== winner).map((r) => r.p));
        if (winner.p - second < 0.04 && !photoShown) { photoShown = true; const el = document.createElement("div"); el.className = "race-photo"; el.textContent = "PHOTO FINISH"; container.querySelector(".race-hud").appendChild(el); setTimeout(() => el.remove(), 2600); }
        say("It's going to be close!");
      }
      // lead changes
      const leader = [...R].sort((a, b) => b.p - a.p)[0];
      if (lastLeader && leader !== lastLeader && now - lastLeadSay > 1600 && T > 0.08 && T < 0.9) { say(pick([`${leader.label} takes the lead!`, `${leader.label} out in front!`, `Here comes ${leader.label}!`])); lastLeadSay = now; }
      lastLeader = leader;
      // finish
      if (!finished && winner.p >= 1) {
        finished = true; winner.p = 1; winner.mode = "win"; slow = false;
        big.innerHTML = `<div class="t">${esc(winner.label.toUpperCase())} WINS!</div>`;
        say(`${winner.label} wins it!`, 4000);
        setTimeout(() => { if (!stopped) onDone(); }, 2600);
      }
      // draw
      R.forEach((r) => { r.actor.set(r.mode); r.actor.tick(slow ? dt / 0.32 * 0.6 : dt, r.v); place(r); });
      const targetCam = Math.max(0, Math.min(L - W, xOf(leader) - W * 0.62));
      camX = lerp(camX, targetCam, 1 - Math.pow(0.001, dt));
      track.setAttribute("transform", `translate(${-camX} 0)`); racerLayer.setAttribute("transform", `translate(${-camX} 0)`);
      stands.setAttribute("transform", `translate(${-camX * 0.55} 0)`);
      fans.forEach((f) => { f.el.setAttribute("transform", `${f.base} translate(0 ${-Math.max(0, Math.sin(now / 260 + f.ph)) * f.amp})`); });
      // HUD
      const order = [...R].sort((a, b) => b.p - a.p);
      order.forEach((r, i) => { const row = boardRows[r.id]; row.style.order = i; row.querySelector(".pos").textContent = i + 1; row.querySelector(".gap").textContent = i === 0 ? "" : `-${((order[0].p - r.p) * 100).toFixed(1)}m`; });
      R.forEach((r) => { dots[r.id].style.left = `${(3 + Math.min(1, r.p) * 91).toFixed(2)}%`; });
      raf = requestAnimationFrame(frame);
    }
    board.style.display = "flex"; board.style.flexDirection = "column";
    Promise.all(R.map(async (r) => { r.actor = await makeActor(r); r.g.appendChild(r.actor.el); place(r); })).then(() => {
      if (stopped) return;
      const now = performance.now(); last = now; countNext = now + 200;
      raf = requestAnimationFrame(frame);
    });
    return { stop() { stopped = true; cancelAnimationFrame(raf); clearTimeout(commTimer); } };
  }

  window.RACE = { run };
})();
