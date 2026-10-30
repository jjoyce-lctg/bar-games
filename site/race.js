/* Stadium mascot race. Usage:
   const ctl = RACE.run(containerEl, { racers, winnerId, venue, onDone });  ctl.stop()
   racers: [{ id, label, emoji, image_url? }]  (image_url = optional uploaded artwork used instead of the vector mascot) */
(function () {
  let W = 1920;   // scene width in 1080-high units; set per run from the container's shape so wide screens see more track, never a zoomed crop
  const H = 1080, L = 7600, START = 420, FINISH = L - 520;
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
    .race-board{position:absolute;right:3vw;top:3vh;background:rgba(0,0,0,.72);border-radius:1.2vh;padding:1.2vh 1.6vh;color:#fff;min-width:24vw}
    .race-board .rows{display:flex;flex-direction:column}
    .race-board .row{display:flex;align-items:center;gap:1.2vh;font-size:2.8vh;font-weight:700;padding:.5vh 0;transition:transform .3s}
    .race-board .row .pos{width:3.2vh;height:3.2vh;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-size:2vh;font-weight:900}
    .race-board .row:first-child .pos{background:var(--accent,#ffcd00)}
    .race-board .row .ico{width:4vh;height:4.6vh;display:flex;align-items:flex-end}
    .race-board .row .ico svg,.race-board .row .ico img{height:100%;width:auto}
    .race-board .row .gap{margin-left:auto;font-weight:500;opacity:.7;font-size:2.2vh;font-variant-numeric:tabular-nums}
    .race-strip{position:relative;margin-top:1vh;height:4.2vh;background:rgba(255,255,255,.12);border-radius:3vh;border:2px solid rgba(255,255,255,.25)}
    .race-strip .dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:3.8vh;height:3.8vh;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 .4vh 1vh rgba(0,0,0,.4);transition:left .12s linear}
    .race-strip .dot svg,.race-strip .dot img{height:88%;width:auto;margin-top:.6vh}
    .race-strip .flag{position:absolute;right:.8vh;top:50%;transform:translateY(-50%);font-size:2.6vh}
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
    if (r.sprite_url) { try { return await window.SPRITES.actor(r.sprite_url, r.extra_url, { scale: r.sprite_scale, fix: r.sprite_fix }); } catch (e) { console.warn(e); } }
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    if (r.image_url) {
      g.innerHTML = `<image href="${esc(r.image_url)}" x="0" y="0" width="200" height="240" preserveAspectRatio="xMidYMax meet"/>`;
      let mode = "idle", t = 0;
      return { el: g, ready: true, stumbleMs: 900, set(m) { mode = m; }, tick(dt, speed = 1) { t += dt; const dy = mode === "run" ? -Math.abs(Math.sin(t * 9 * speed)) * 12 : mode === "win" ? -Math.abs(Math.sin(t * 7)) * 34 : 0; const rot = mode === "run" ? 8 : mode === "stumble" ? 35 : 0; g.setAttribute("transform", `translate(0 ${dy}) rotate(${rot} 100 240)`); } };
    }
    g.innerHTML = window.MASCOTS.markup(r.id, { emoji: r.emoji });
    return window.SPRITES.vectorActor(g.querySelector(".mascot"));
  }

  // ---------- stadium artwork (site/stadium/*), 1080-high reference scene, 4096-wide tiles ----------
  const TILE = 4096, ART_BASE = (() => { try { return new URL("stadium/", document.currentScript.src).href; } catch { return "stadium/"; } })();
  // Track themes: folder under stadium/ with far.jpg, wall.png, track-start.jpg, track.jpg, gantry.png, finish-strip.png and optional prop-N.png
  const THEMES = {
    classic: { name: "Stadium", props: 0, sky: "#1b7fd6" },
    halloween: { name: "Halloween", props: 3, sky: "#2a1240" },
    thanksgiving: { name: "Thanksgiving", props: 3, sky: "#c9742a" },
    christmas: { name: "Christmas", props: 3, sky: "#3aa0e6" },
  };
  const LANE_FEET = [784, 865, 947, 1032];           // feet-anchor Y per lane (top to bottom)
  const PARALLAX = { far: 0.2, wall: 0.55, track: 1 };
  const WALL_Y = 540, TRACK_TOP = 720, BANNER = { y0: 610, y1: 705 };
  function tiles(href, y, h, count, startX = 0) {
    let out = "";
    for (let i = 0; i < count; i++) out += `<image href="${href}" x="${startX + i * TILE - i}" y="${y}" width="${TILE}" height="${h}" preserveAspectRatio="none"/>`;
    return out;
  }
  function buildWorld(racers, venue, themeKey) {
    const theme = THEMES[themeKey] || THEMES.classic, ART = ART_BASE + (THEMES[themeKey] ? themeKey : "classic") + "/";
    const n = racers.length;
    const name = esc((venue.name || "").toUpperCase());
    const primary = venue.color_primary || "#1c2a4a";
    // how many tiles each layer needs to cover the camera range (camera moves up to L - W)
    const need = (f) => Math.ceil(((L - W) * f + W) / TILE) + 1;
    // bar name on the wall banner and on the far scoreboard, repeated per tile
    let banners = "";
    for (let i = 0; i < need(PARALLAX.wall); i++) banners += `<text x="${i * TILE + 2048}" y="${(BANNER.y0 + BANNER.y1) / 2 + 22}" font-size="64" font-weight="900" fill="${primary}" text-anchor="middle" font-family="Bebas Neue,Impact,sans-serif" letter-spacing="6">${name}</text>`;
    const trackTiles = tiles(ART + "track-start.jpg", TRACK_TOP, 360, 1) + tiles(ART + "track.jpg", TRACK_TOP, 360, need(1) - 1, TILE - 1);
    // finish props: strip spans the lanes at FINISH; gantry stands on the track edge behind the racers
    const stripW = 64, stripH = 384;
    const gantryH = 430, gantryW = gantryH * 800 / 900;
    const props = `<image href="${ART}gantry.png" x="${FINISH - gantryW / 2 + 2}" y="${TRACK_TOP - gantryH + 12}" width="${gantryW}" height="${gantryH}"/>
      <image href="${ART}finish-strip.png" x="${FINISH - stripW / 2}" y="${TRACK_TOP - 14}" width="${stripW}" height="${stripH}"/>`;
    // themed scenery props sit on top of the barrier wall (wall layer), spaced along the course, never on the lanes
    let scenery = "";
    for (let i = 0; i < theme.props; i++) { const h = 210, wmax = 300; scenery += `<image href="${ART}prop-${i + 1}.png" x="${700 + i * 1500}" y="${WALL_Y + 24 - h}" width="${wmax}" height="${h}" preserveAspectRatio="xMidYMax meet"/>`; }
    const laneFeet = n <= 4 ? LANE_FEET.slice(0, n) : Array.from({ length: n }, (_, i) => Math.round(LANE_FEET[0] - 20 + i * ((LANE_FEET[3] - LANE_FEET[0] + 20) / (n - 1))));
    return { laneFeet, svg: `
      <defs>${window.MASCOTS.DEFS.replace(/<\/?defs>/g, "")}</defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="${theme.sky}"/>
      <g class="layer-far">${tiles(ART + "far.jpg", 0, 1080, need(PARALLAX.far))}</g>
      <g class="layer-wall">${tiles(ART + "wall.png", WALL_Y, 540, need(PARALLAX.wall))}${scenery}${banners}</g>
      <g class="layer-track">${trackTiles}${props}</g>
      <g class="layer-racers"></g>` };
  }

  function run(container, opts) {
    injectCss();
    const { racers, winnerId, venue = {}, onDone = () => {}, duration = 15000 } = opts;
    const rect = container.getBoundingClientRect(); const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    W = Math.max(1200, Math.round(H * aspect));
    const n = racers.length;
    container.innerHTML = `<div class="race-wrap" style="--accent:${venue.color_accent || "#ffcd00"}">
      <svg class="world" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"></svg>
      <div class="race-hud"><div class="race-comm"></div><div class="race-board"><div class="rows"></div><div class="race-strip"><span class="flag">🏁</span></div></div><div class="race-big"></div></div></div>`;
    const svg = container.querySelector("svg.world"), comm = container.querySelector(".race-comm"), board = container.querySelector(".race-board .rows"), strip = container.querySelector(".race-strip"), big = container.querySelector(".race-big");
    const world = buildWorld(racers, venue, opts.theme);
    svg.innerHTML = world.svg;
    const far = svg.querySelector(".layer-far"), wall = svg.querySelector(".layer-wall"), track = svg.querySelector(".layer-track"), racerLayer = svg.querySelector(".layer-racers");

    // racer elements (actors are built asynchronously, the race starts once all are ready)
    const scale = racers.length > 4 ? 0.56 : 0.64;   // 300px sprite frame -> ~190px on the 1080 scene (a bit smaller with 5+ lanes)
    const R = racers.map((r, i) => {
      const laneY = world.laneFeet[i] ?? (1032 - (racers.length - 1 - i) * 82);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.innerHTML = `<ellipse class="shadow" cx="100" cy="240" rx="70" ry="10" fill="#000" opacity=".28"/>`;
      racerLayer.appendChild(g);
      return { ...r, i, g, actor: null, laneY, p: 0, v: 1, mode: "idle", burstUntil: 0, burst: 1, stumbleUntil: 0, boosts: [] };
    });
    const winner = R.find((r) => r.id === winnerId) || R[0];
    if (opts.debug) window.__race = R;

    // drama script. Each race gets a finish style:
    //  photo   - winner and one rival trade the lead to the line, decided by a nose (slow-mo + PHOTO FINISH)
    //  comeback- winner sits 3rd/4th until late, then storms past (slow-mo, no banner unless truly close)
    //  runaway - winner breaks clear with a third to go and wins easily (no slow-mo)
    const others = R.filter((r) => r !== winner).sort(() => Math.random() - 0.5);
    const style = opts.finishStyle || pick(["photo", "photo", "comeback", "comeback", "runaway"]);
    const rivals = style === "photo" ? others.slice(0, Math.random() < 0.4 ? 3 : 2) : [];
    const rival = others[0];
    if (others[0]) others[0].boosts.push([0.12, 0.38, 1.2]);
    if (others[1]) others[1].boosts.push([0.42, 0.66, 1.22]);
    if (others[2]) others[2].boosts.push([0.2, 0.3, 1.12], [0.58, 0.7, 1.15]);
    let margin, surge, slowFactor, photoGap;
    if (style === "photo") { winner.boosts.push([0.0, 0.1, 1.08], [0.72, 1.0, 1.1]); rivals.forEach((rv) => rv.boosts.push([0.7, 1.0, 1.08])); margin = 0.005; surge = 0; slowFactor = 0.3; photoGap = 0.02; }
    else if (style === "comeback") { winner.boosts.push([0.0, 0.45, 0.9], [0.62, 1.0, 1.5]); margin = 0.03; surge = 1; slowFactor = 0.45; photoGap = 0.012; }
    else { winner.boosts.push([0.0, 0.1, 1.08], [0.55, 1.0, 1.38]); margin = 0.07; surge = 1; slowFactor = 0.75; photoGap = 0; }
    const stumbler = others.length ? pick(others.filter((o) => !rivals.includes(o))) || null : null, stumbleAt = rnd(0.28, 0.6);
    let stumbled = false;

    // HUD setup
    board.innerHTML = R.map((r) => `<div class="row" data-id="${esc(r.id)}"><span class="pos">1</span><span class="ico">${racerArt(r, 46)}</span><span>${esc(r.label)}</span><span class="gap"></span></div>`).join("");
    strip.innerHTML += R.map((r) => `<div class="dot" data-id="${esc(r.id)}" style="left:0">${racerArt(r, 40)}</div>`).join("");
    const boardRows = Object.fromEntries(Array.from(board.children).map((el) => [el.dataset.id, el]));
    const dots = Object.fromEntries(Array.from(strip.querySelectorAll(".dot")).map((el) => [el.dataset.id, el]));

    const audio = (n, d) => { try { if (window.AUDIO) window.AUDIO.event(n, d); } catch (e) {} };
    let commTimer = null;
    const say = (text, ms = 2200) => { comm.textContent = text; comm.classList.add("on"); clearTimeout(commTimer); commTimer = setTimeout(() => comm.classList.remove("on"), ms); };

    const xOf = (r) => START + r.p * (FINISH - START);
    const place = (r) => { r.g.setAttribute("transform", `translate(${xOf(r) - 100 * scale} ${r.laneY - 240 * scale}) scale(${scale})`); };
    let camX = 0, lastLeader = null, lastLeadSay = 0, slow = false, photoShown = false, finished = false, raf = 0, stopped = false, finalOrder = null;
    const t0 = performance.now(); let last = t0, raceStart = 0, phaseT = "count";
    const countdown = ["ON YOUR MARKS", "GET SET", "GO!"];
    let countIdx = 0, countNext = t0 + 200;

    function frame(now) {
      if (stopped) return;
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      // ---- countdown ----
      if (phaseT === "count") {
        if (now >= countNext) {
          if (countIdx < countdown.length) { big.innerHTML = `<div class="t" style="font-size:${countIdx === 2 ? 34 : 16}vh">${countdown[countIdx]}</div>`; audio(["marks", "set", "go"][countIdx]); countNext = now + [2100, 1250, 700][countIdx]; countIdx++; }
          else { big.innerHTML = ""; phaseT = "race"; raceStart = now; R.forEach((r) => (r.mode = "run")); say("And they're off!"); }
        }
        R.forEach((r) => { r.actor.set("idle"); r.actor.tick(dt, 1); place(r); });
        raf = requestAnimationFrame(frame); return;
      }
      // ---- race ----
      const T = Math.min(1.2, (now - raceStart) / duration);
      if (slow) dt *= slowFactor;
      const leaderP = Math.max(...R.map((r) => r.p));
      R.forEach((r) => {
        if (r.mode === "win" || r.mode === "tired") return;
        if (now > r.burstUntil) { r.burst = rnd(0.82, 1.18); r.burstUntil = now + rnd(400, 900); }
        let f = r.burst;
        r.boosts.forEach(([a, b, k]) => { if (T >= a && T <= b) f *= k; });
        if (r !== winner && r.p < leaderP - 0.1) f *= 1.15;               // pack stays together
        if (style === "photo" && T > 0.4) {   // rivals and winner stay glued, with a proportional (smooth) tug
          if (rivals.includes(r)) f *= 1 + Math.max(0, Math.min(0.45, (winner.p - r.p - 0.006) * 25));
          if (r === winner) { const ahead = Math.max(...rivals.map((rv) => rv.p)); f *= 1 + Math.max(0, Math.min(0.45, (ahead - r.p - 0.006) * 25)); }
        }
        if (r === stumbler && !stumbled && T >= stumbleAt) { stumbled = true; r.stumbleUntil = now + r.actor.stumbleMs; say(`${r.label} goes down!`); audio("stumble", { racerId: r.id }); }
        if (now < r.stumbleUntil) { f *= 0.1; r.mode = "stumble"; } else if (r.mode === "stumble") r.mode = "run";
        r.v = f;
        r.p += (f / (duration / 1000)) * dt;
        if (r !== winner) {
          if (!finished) {
            const m = rivals.includes(r) ? margin : Math.max(margin, 0.02) + 0.012 * r.i;
            if (T > 0.7 && r.p > winner.p - m) { r.p -= (f / (duration / 1000)) * dt * (r.p > winner.p - m + 0.01 ? 0.7 : 0.45); }   // ease off, never snap back
            if (winner.p > 0.9 && r.p > winner.p - 0.004) r.p -= (f / (duration / 1000)) * dt * 0.75;   // final stretch: cannot overtake, still never moves backward
            r.p = Math.min(r.p, 0.998);
          }
          else if (r.p >= r.stopAt) { r.p = r.stopAt; r.mode = "tired"; }
        }
      });
      // photo finish / slow-mo
      if (!slow && !finished && winner.p > 0.9) {
        slow = true;
        const second = Math.max(...R.filter((r) => r !== winner).map((r) => r.p));
        const gap = winner.p - second;
        audio("stretch", { style: gap < photoGap ? "photo" : style });
        if (gap < photoGap && !photoShown) { photoShown = true; audio("photo"); const el = document.createElement("div"); el.className = "race-photo"; el.textContent = "PHOTO FINISH"; container.querySelector(".race-hud").appendChild(el); setTimeout(() => el.remove(), 2600); say("It's going to be close!"); }
        else if (style === "comeback") say(`${winner.label} is flying!`);
        else if (style === "runaway") say(`${winner.label} is running away with it!`);
        else say("Down the stretch they come!");
      }
      // lead changes
      const leader = [...R].sort((a, b) => b.p - a.p)[0];
      if (lastLeader && leader !== lastLeader && now - lastLeadSay > 1600 && T > 0.08 && T < 0.9) { say(pick([`${leader.label} takes the lead!`, `${leader.label} out in front!`, `Here comes ${leader.label}!`])); audio("lead", { racerId: leader.id }); lastLeadSay = now; }
      lastLeader = leader;
      // finish
      if (!finished && winner.p >= 1) {
        finished = true; winner.p = 1; winner.mode = "win"; slow = false;
        finalOrder = [winner, ...R.filter((r) => r !== winner).sort((a, b) => b.p - a.p)];
        R.forEach((r) => { r.finalGap = Math.max(0, winner.p - r.p); r.stopAt = r === winner ? 1 : Math.min(0.999, Math.max(r.p + 0.006, Math.min(0.975, r.p + 0.045))); });
        big.innerHTML = `<div class="t">${esc(winner.label.toUpperCase())} WINS!</div>`;
        say(`${winner.label} wins it!`, 4000); audio("finish", { racerId: winner.id });
        setTimeout(() => { if (!stopped) onDone(); }, 3400);
      }
      // draw
      R.forEach((r) => { r.actor.set(r.mode); r.actor.tick(slow ? dt / slowFactor * 0.6 : dt, r.v); place(r); });
      const targetCam = Math.max(0, Math.min(L - W, xOf(finished ? winner : leader) - W * 0.62));
      camX = lerp(camX, targetCam, 1 - Math.pow(0.001, dt));
      const cx = Math.round(camX);
      track.setAttribute("transform", `translate(${-cx} 0)`); racerLayer.setAttribute("transform", `translate(${-cx} 0)`);
      wall.setAttribute("transform", `translate(${-Math.round(cx * PARALLAX.wall)} 0)`);
      far.setAttribute("transform", `translate(${-Math.round(cx * PARALLAX.far)} 0)`);
      // HUD
      const order = finalOrder || [...R].sort((a, b) => b.p - a.p);
      order.forEach((r, i) => { const row = boardRows[r.id]; row.style.order = i; row.querySelector(".pos").textContent = i + 1; row.querySelector(".gap").textContent = i === 0 ? "" : `-${((finalOrder ? r.finalGap : order[0].p - r.p) * 100).toFixed(1)}m`; });
      R.forEach((r) => { dots[r.id].style.left = `${(4 + Math.min(1, r.p) * 84).toFixed(2)}%`; });
      raf = requestAnimationFrame(frame);
    }

    Promise.all(R.map(async (r) => { r.actor = await makeActor(r); r.g.appendChild(r.actor.el); place(r); })).then(() => {
      if (stopped) return;
      const now = performance.now(); last = now; countNext = now + 200;
      raf = requestAnimationFrame(frame);
    });
    return { stop() { stopped = true; cancelAnimationFrame(raf); clearTimeout(commTimer); } };
  }

  window.RACE = { run, THEMES };
})();
