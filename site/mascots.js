/* Original vector mascots for the race. Each lives in a 200x240 box, feet on y=240, centered on x=100.
   MASCOTS.markup(id)        -> inner SVG markup (<g class="mascot">...</g>) to place inside an <svg>
   MASCOTS.standalone(id, h) -> a complete inline <svg> string h pixels tall
   MASCOTS.pose(el, state)   -> animates limbs on a placed mascot element */
(function () {
  const HIP = { lx: 82, rx: 118, y: 178 };      // where legs attach
  const SHOULDER = { lx: 56, rx: 144, y: 120 }; // where arms attach

  const shoe = (color) => `<path d="M-14 56 h30 a10 10 0 0 1 10 10 v4 h-46 v-4 a6 6 0 0 1 6 -10z" fill="${color}"/><rect x="-16" y="66" width="48" height="6" rx="3" fill="#fff"/>`;
  const leg = (cls, x, skin, shoeColor) =>
    `<g class="limb ${cls}" data-px="${x}" data-py="${HIP.y}" transform="translate(0 0)"><line x1="${x}" y1="${HIP.y}" x2="${x}" y2="${HIP.y + 56}" stroke="${skin}" stroke-width="16" stroke-linecap="round"/><g transform="translate(${x} ${HIP.y})">${shoe(shoeColor)}</g></g>`;
  const arm = (cls, x, skin, dir) =>
    `<g class="limb ${cls}" data-px="${x}" data-py="${SHOULDER.y}"><line x1="${x}" y1="${SHOULDER.y}" x2="${x + dir * 6}" y2="${SHOULDER.y + 50}" stroke="${skin}" stroke-width="14" stroke-linecap="round"/><circle cx="${x + dir * 7}" cy="${SHOULDER.y + 56}" r="12" fill="#fff" stroke="${skin}" stroke-width="3"/></g>`;
  const face = (cx, cy, s = 1, mouth = "smile") => `
    <g class="face" transform="translate(${cx} ${cy}) scale(${s})">
      <ellipse cx="-16" cy="-6" rx="11" ry="13" fill="#fff"/><ellipse cx="16" cy="-6" rx="11" ry="13" fill="#fff"/>
      <circle class="pupil" cx="-13" cy="-4" r="5.5" fill="#1a1a1a"/><circle class="pupil" cx="19" cy="-4" r="5.5" fill="#1a1a1a"/>
      <circle cx="-11" cy="-7" r="2" fill="#fff"/><circle cx="21" cy="-7" r="2" fill="#fff"/>
      <path d="M-20 -22 q8 -6 16 -2" stroke="#1a1a1a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M4 -24 q8 -4 16 2" stroke="#1a1a1a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      ${mouth === "smile" ? `<path d="M-14 12 q14 18 28 0" stroke="#1a1a1a" stroke-width="4" fill="#5a1a1a" stroke-linecap="round"/>` : `<ellipse cx="0" cy="14" rx="9" ry="11" fill="#5a1a1a" stroke="#1a1a1a" stroke-width="3"/>`}
      <circle cx="-30" cy="10" r="7" fill="#ff8a8a" opacity=".55"/><circle cx="30" cy="10" r="7" fill="#ff8a8a" opacity=".55"/>
    </g>`;

  const BODIES = {
    hotdog: {
      skin: "#e8b86b", shoe: "#d33a2c",
      body: `
        <rect x="52" y="22" width="96" height="170" rx="48" fill="#e2a95a"/>
        <rect x="60" y="30" width="80" height="154" rx="40" fill="#f0c07a"/>
        <rect x="76" y="26" width="48" height="162" rx="24" fill="#c8452c"/>
        <rect x="82" y="32" width="18" height="150" rx="9" fill="#d9573d" opacity=".7"/>
        <path d="M84 36 L116 52 L84 68 L116 84 L84 100 L116 116 L84 132 L116 148 L84 164 L116 180" stroke="#ffd23f" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      face: face(100, 104, 0.9),
    },
    beer: {
      skin: "#f2a516", shoe: "#2b6cb0",
      body: `
        <path d="M138 90 h18 a16 16 0 0 1 16 16 v40 a16 16 0 0 1 -16 16 h-18 v-14 h14 a4 4 0 0 0 4 -4 v-36 a4 4 0 0 0 -4 -4 h-14z" fill="#d9d9d9"/>
        <rect x="56" y="58" width="88" height="130" rx="14" fill="#f2a516"/>
        <rect x="56" y="58" width="88" height="130" rx="14" fill="url(#beerShine)"/>
        <rect x="66" y="70" width="12" height="100" rx="6" fill="#fff" opacity=".35"/>
        <circle cx="90" cy="150" r="4" fill="#fff3c4" opacity=".8"/><circle cx="118" cy="130" r="3" fill="#fff3c4" opacity=".8"/><circle cx="104" cy="170" r="3.5" fill="#fff3c4" opacity=".8"/>
        <circle cx="68" cy="56" r="16" fill="#fff"/><circle cx="92" cy="46" r="20" fill="#fff"/><circle cx="118" cy="48" r="18" fill="#fff"/><circle cx="138" cy="58" r="14" fill="#fff"/>
        <rect x="56" y="52" width="88" height="14" fill="#fff"/>
        <path d="M74 64 q6 14 0 26" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
      face: face(100, 112, 0.95),
    },
    pretzel: {
      skin: "#a0522d", shoe: "#2f855a",
      body: `
        <!-- outer loop -->
        <path d="M64 176 C22 160 18 84 62 62 C92 48 102 78 100 96 C98 78 108 48 138 62 C182 84 178 160 136 176 Z" fill="none" stroke="#7a3e1d" stroke-width="36" stroke-linejoin="round"/>
        <path d="M64 176 C22 160 18 84 62 62 C92 48 102 78 100 96 C98 78 108 48 138 62 C182 84 178 160 136 176 Z" fill="none" stroke="#b8702f" stroke-width="27" stroke-linejoin="round"/>
        <!-- crossed strands -->
        <path d="M58 80 C96 96 118 126 134 178 M142 80 C104 96 82 126 66 178" fill="none" stroke="#7a3e1d" stroke-width="32" stroke-linecap="round"/>
        <path d="M58 80 C96 96 118 126 134 178 M142 80 C104 96 82 126 66 178" fill="none" stroke="#b8702f" stroke-width="23" stroke-linecap="round"/>
        <path d="M44 100 C34 130 40 156 60 170" fill="none" stroke="#d08a44" stroke-width="6" stroke-linecap="round" opacity=".6"/>
        <!-- face plate -->
        <ellipse cx="100" cy="126" rx="34" ry="26" fill="#b8702f" stroke="#7a3e1d" stroke-width="6"/>
        <g fill="#fff" stroke="#e6e6e6" stroke-width="1"><rect x="40" y="110" width="8" height="4" rx="1" transform="rotate(80 44 112)"/><rect x="152" y="108" width="8" height="4" rx="1" transform="rotate(-80 156 110)"/><rect x="70" y="60" width="8" height="4" rx="1" transform="rotate(-20 74 62)"/><rect x="122" y="58" width="8" height="4" rx="1" transform="rotate(20 126 60)"/><rect x="80" y="172" width="8" height="4" rx="1"/><rect x="112" y="172" width="8" height="4" rx="1"/><rect x="120" y="150" width="8" height="4" rx="1" transform="rotate(60 124 152)"/><rect x="72" y="150" width="8" height="4" rx="1" transform="rotate(-60 76 152)"/></g>`,
      face: face(100, 128, 0.72),
    },
    pizza: {
      skin: "#f6c453", shoe: "#9b1c1c",
      body: `
        <path d="M100 18 L162 180 L38 180 Z" fill="#e3a94f"/>
        <path d="M100 32 L152 172 L48 172 Z" fill="#f6c453"/>
        <path d="M44 168 h112 l8 20 h-128z" fill="#c98a3a"/>
        <path d="M48 172 h104" stroke="#e8b25c" stroke-width="5" stroke-linecap="round"/>
        <circle cx="100" cy="68" r="12" fill="#b42c2c"/><circle cx="78" cy="120" r="13" fill="#b42c2c"/><circle cx="126" cy="128" r="12" fill="#b42c2c"/><circle cx="100" cy="158" r="10" fill="#b42c2c"/>
        <circle cx="100" cy="68" r="12" fill="url(#pepGloss)"/><circle cx="78" cy="120" r="13" fill="url(#pepGloss)"/><circle cx="126" cy="128" r="12" fill="url(#pepGloss)"/>
        <path d="M88 96 q8 -8 16 0" stroke="#fff3c4" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
        <path d="M60 150 q8 -8 16 0" stroke="#fff3c4" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>`,
      face: face(102, 104, 0.8),
    },
  };

  const DEFS = `<defs>
    <linearGradient id="beerShine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".15"/></linearGradient>
    <radialGradient id="pepGloss" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></radialGradient>
  </defs>`;

  function markup(id, opts = {}) {
    const b = BODIES[id];
    if (!b) {
      const emoji = opts.emoji || "⭐";
      return `<g class="mascot" data-id="${id}"><text x="100" y="170" font-size="150" text-anchor="middle">${emoji}</text></g>`;
    }
    return `<g class="mascot" data-id="${id}">
      ${leg("leg back", HIP.lx + 4, b.skin, b.shoe)}${arm("arm back", SHOULDER.lx + 6, b.skin, -1)}
      <g class="body">${b.body}${b.face}</g>
      ${arm("arm front", SHOULDER.rx - 6, b.skin, 1)}${leg("leg front", HIP.rx - 4, b.skin, b.shoe)}
    </g>`;
  }

  function standalone(id, height = 120, opts = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250" height="${height}" style="overflow:visible">${DEFS}${markup(id, opts)}</svg>`;
  }

  // Animate a placed mascot. state = { phase (radians), mode: "run"|"idle"|"win"|"stumble", lean }
  function pose(el, state) {
    const { phase = 0, mode = "run", lean = 0 } = state;
    const legs = { back: el.querySelector(".leg.back"), front: el.querySelector(".leg.front") };
    const arms = { back: el.querySelector(".arm.back"), front: el.querySelector(".arm.front") };
    const body = el.querySelector(".body");
    const rot = (g, a) => { if (g) g.setAttribute("transform", `rotate(${a} ${g.dataset.px} ${g.dataset.py})`); };
    let bob = 0, tilt = lean;
    if (mode === "run") {
      const s = Math.sin(phase), c = Math.sin(phase + Math.PI);
      rot(legs.front, s * 38); rot(legs.back, c * 38);
      rot(arms.front, c * 45 - 10); rot(arms.back, s * 45 - 10);
      bob = -Math.abs(Math.cos(phase)) * 10; tilt = lean + 8;
    } else if (mode === "win") {
      const s = Math.sin(phase * 2);
      rot(legs.front, 0); rot(legs.back, 0);
      rot(arms.front, -160 + s * 10); rot(arms.back, 160 - s * 10);
      bob = -Math.abs(Math.sin(phase * 2)) * 30;
    } else if (mode === "stumble") {
      rot(legs.front, 60); rot(legs.back, -20); rot(arms.front, -80); rot(arms.back, -60); tilt = lean + 35; bob = 10;
    } else {
      const s = Math.sin(phase);
      rot(legs.front, 0); rot(legs.back, 0); rot(arms.front, s * 6); rot(arms.back, -s * 6); bob = s * 2;
    }
    el.setAttribute("transform", `${el.dataset.base || ""} translate(0 ${bob}) rotate(${tilt} 100 240)`);
    if (body) body.setAttribute("transform", mode === "run" ? `rotate(${Math.sin(phase) * 3} 100 120)` : "");
  }

  window.MASCOTS = { markup, standalone, pose, DEFS, has: (id) => !!BODIES[id] };
})();
