/* Race audio: procedural crowd (Web Audio) + recorded announcer clips.
   Announcer clips live in site/announcer/<key>.mp3 (see ANNOUNCER_LINES in SETUP.md). Missing clips are skipped silently.
   AUDIO.unlock() must run from a user gesture (the DJ pressing Enter / clicking) before anything plays.
   AUDIO.event(name, data) is called by the race engine. Keys: M toggles mute. */
(function () {
  const BASE = (() => { try { return new URL("announcer/", document.currentScript.src).href; } catch { return "announcer/"; } })();
  let ctx = null, master = null, crowd = null, muted = false, volume = 0.9;
  try { muted = localStorage.getItem("lctg.muted") === "1"; } catch {}
  const clipCache = {}, missing = new Set();
  const SFX = (() => { try { return new URL("sfx/", document.currentScript.src).href; } catch { return "sfx/"; } })();
  let sfxAvail = new Set();
  fetch(SFX + "manifest.json").then((r) => r.ok ? r.json() : { clips: [] }).then((m) => { sfxAvail = new Set(m.clips || []); }).catch(() => {});
  const sfxCache = {};
  function sfx(key, { loop = false, vol = 1 } = {}) {   // play a recorded effect if we have it; returns the element or null
    if (!sfxAvail.has(key)) return null;
    let a = sfxCache[key]; if (!a || !loop) { a = new Audio(SFX + key + ".mp3"); a.loop = loop; if (loop) sfxCache[key] = a; }
    a.volume = Math.max(0, Math.min(1, vol * (muted ? 0 : volume))); const p = a.play(); if (p && p.catch) p.catch(() => {}); return a;
  }
  let available = null;   // Set of clip keys listed in announcer/manifest.json; null until loaded
  fetch(BASE + "manifest.json").then((r) => r.ok ? r.json() : { clips: [] }).then((m) => { available = new Set(m.clips || []); }).catch(() => { available = new Set(); });
  let current = null;           // currently playing announcer <audio>
  let crowdTarget = 0, crowdLevel = 0, ducking = 0;

  function unlock() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
      buildCrowd();
    } catch (e) { console.warn("audio unavailable", e); }
  }

  // ---- crowd: two noise beds (low rumble + mid chatter) with slow random modulation ----
  function noiseBuffer(seconds) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; } // pink-ish
    return b;
  }
  function buildCrowd() {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    const mk = (type, freq, q, gain) => { const src = ctx.createBufferSource(); src.buffer = noiseBuffer(6); src.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(out); src.start(); return { src, f, g }; };
    const low = mk("lowpass", 320, 0.7, 0.9), mid = mk("bandpass", 900, 0.6, 0.6), hi = mk("bandpass", 2400, 0.8, 0.25);
    // slow wobble so it breathes
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.17; lfoG.gain.value = 0.18; lfo.connect(lfoG); lfoG.connect(mid.g.gain); lfo.start();
    crowd = { out, low, mid, hi };
    setInterval(() => {
      crowdLevel += (crowdTarget - crowdLevel) * 0.08; const duck = current && !current.paused ? 0.45 : 1;
      const bed = sfxAvail.has("crowd-loop") ? (sfxCache["crowd-loop"] || (crowdLevel > 0.01 ? sfx("crowd-loop", { loop: true, vol: 0 }) : null)) : null;
      if (bed) { bed.volume = Math.max(0, Math.min(1, crowdLevel * duck * (muted ? 0 : volume))); out.gain.setTargetAtTime(0, ctx.currentTime, 0.1); }
      else { out.gain.setTargetAtTime(Math.max(0, crowdLevel) * duck, ctx.currentTime, 0.1); mid.f.frequency.setTargetAtTime(700 + crowdLevel * 600, ctx.currentTime, 0.3); }
    }, 50);
  }
  const setCrowd = (level) => { crowdTarget = level; };
  function crowdBurst(amount = 0.5, ms = 900) { const was = crowdTarget; crowdTarget = Math.min(1.2, crowdTarget + amount); setTimeout(() => { if (crowdTarget > was) crowdTarget = was; }, ms); }

  // ---- synthesized one-shots ----
  function tone(freq, dur, type = "square", gain = 0.25, slide = 0) {
    if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.05);
  }
  const beep = () => { if (!sfx("beep")) tone(880, 0.18, "square", 0.18); };
  const horn = () => { if (!sfx("horn")) { tone(196, 0.9, "sawtooth", 0.3); tone(247, 0.9, "sawtooth", 0.2); tone(294, 0.9, "sawtooth", 0.15); } };
  const sting = () => { if (!sfx("sting")) { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.35, "square", 0.2), i * 110)); setTimeout(() => tone(1047, 0.9, "sawtooth", 0.18), 440); } };
  const ooh = () => { if (!sfx("crowd-ooh")) tone(300, 0.5, "sine", 0.12, -120); crowdBurst(0.5, 700); };
  const cheer = (vol = 0.8) => { sfx("crowd-cheer", { vol }); };
  const roar = () => { if (!sfx("crowd-roar")) cheer(1); };

  // ---- announcer clips ----
  function clip(key) {
    if (!key || missing.has(key) || !available || !available.has(key)) return null;
    if (!clipCache[key]) { const a = new Audio(BASE + key + ".mp3"); a.preload = "auto"; a.addEventListener("error", () => missing.add(key)); clipCache[key] = a; }
    return clipCache[key];
  }
  function say(keys, { interrupt = true } = {}) {
    if (muted) return false;
    for (const key of [].concat(keys)) {
      const a = clip(key); if (!a || missing.has(key)) continue;
      if (current && !current.paused) { if (!interrupt) return false; current.pause(); }
      a.currentTime = 0; a.volume = volume; const p = a.play(); if (p && p.catch) p.catch(() => {}); current = a; return true;
    }
    return false;
  }
  function preload(keys) { keys.forEach(clip); }

  // ---- events from the race engine ----
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  function event(name, d = {}) {
    if (!ctx) return;
    const who = slug(d.racerId || d.racer);
    switch (name) {
      case "lobby": setCrowd(0.22); say("welcome", { interrupt: false }); break;
      case "marks": setCrowd(0.3); say("marks"); break;
      case "set": beep(); setCrowd(0.35); say("set"); break;
      case "go": horn(); cheer(0.7); crowdBurst(0.6, 1500); setCrowd(0.55); say("go"); break;
      case "lead": cheer(0.5); crowdBurst(0.3, 800); say([`lead-${who}`, "lead"]); break;
      case "stumble": ooh(); say([`down-${who}`, "down"]); break;
      case "stretch": setCrowd(0.8); say(d.style === "photo" ? ["close", "stretch"] : d.style === "runaway" ? ["runaway", "stretch"] : ["comeback", "stretch"]); break;
      case "photo": crowdBurst(0.4, 1200); break;
      case "finish": roar(); crowdBurst(0.8, 3000); setCrowd(0.9); sting(); setTimeout(() => say([`wins-${who}`, "wins"]), 350); setTimeout(() => setCrowd(0.4), 5000); break;
      case "results": setCrowd(0.35); break;
      case "end": setCrowd(0); break;
      case "countbeep": beep(); break;
    }
  }
  function setMuted(m) { muted = m; try { localStorage.setItem("lctg.muted", m ? "1" : "0"); } catch {} if (master) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.05); if (m && current) current.pause(); Object.values(sfxCache).forEach((a) => { if (m) a.volume = 0; }); }
  document.addEventListener("keydown", (e) => { if ((e.key === "m" || e.key === "M") && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) setMuted(!muted); });

  window.AUDIO = { unlock, event, say, preload, setMuted, isMuted: () => muted, setCrowd, ready: () => !!ctx };
})();
