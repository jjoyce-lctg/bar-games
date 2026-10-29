/* Shared data layer for all pages.
   Uses Supabase when config.js has a URL. Falls back to an in-browser mock
   (for previews and testing) when it does not, or when the URL has ?mock=1. */
(function () {
  const CFG = window.BAR_GAMES_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const MOCK = params.get("mock") === "1" || !CFG.SUPABASE_URL;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtPhone = (d) => (d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || "");
  const normPhone = (s) => { let d = String(s || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d; };
  const makeCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const entryUrl = (code) => { const u = new URL("entry.html", location.href); u.searchParams.set("c", code); if (MOCK) u.searchParams.set("mock", "1"); return u.toString(); };
  // A plain username becomes username@<USERNAME_DOMAIN>; a full email address is used as-is.
  // Built-in artwork per racer id. Admin uploads (sprite_url / image_url on the option) take priority over these.
  const BUILTIN_ART = { hotdog: 1, beer: 1, pretzel: 1, pizza: 1 };
  const decorateOptions = (options) => (options || []).map((o) => {
    const out = { ...o };
    if (!out.sprite_url && !out.image_url && BUILTIN_ART[out.id]) { out.sprite_url = `sprites/${out.id}/atlas.png`; out.extra_url = `sprites/${out.id}/extra.png`; out.icon_url = `sprites/${out.id}/icon.png`; }
    return out;
  });
  const usernameToEmail = (u) => { const s = String(u).trim().toLowerCase(); return s.includes("@") ? s : `${s.replace(/[^a-z0-9._-]/g, "")}@${CFG.USERNAME_DOMAIN || "djs.local"}`; };

  // ---------------- MOCK BACKEND (no network) ----------------
  function mockApi() {
    const KEY = "barGamesMock";
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
    const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    let state = load() || {
      session: null,
      profiles: [{ id: "u-admin", username: "admin", role: "admin", active: true, password: "admin" },
                 { id: "u-dj", username: "dj", role: "dj", active: true, password: "dj" },
                 { id: "u-mgr", username: "manager", role: "manager", active: true, password: "manager" }],
      prizes: [],
      seasons: [{ id: "s1", name: "Fall 2026", starts_on: "2026-09-01", ends_on: "2027-02-15" }],
      venues: [
        { id: "v1", name: "Willie Lill's", slug: "willie-lills", color_primary: "#0a0a0a", color_accent: "#ffcd00", tagline: "Chicago's Hawkeye bar", default_prize: "a round on us", sort_order: 1, active: true, logo_url: null },
        { id: "v2", name: "Duffy's", slug: "duffys", color_primary: "#0f5c2e", color_accent: "#f2f2f2", tagline: "Lincoln Park", default_prize: "a round on us", sort_order: 2, active: true, logo_url: null },
        { id: "v3", name: "The Butcher's Tap", slug: "butchers-tap", color_primary: "#8b1a1a", color_accent: "#f3e9d2", tagline: "Lincoln Park", default_prize: "a round on us", sort_order: 3, active: true, logo_url: null },
        { id: "v4", name: "Rebel and Rye", slug: "rebel-and-rye", color_primary: "#1f1a17", color_accent: "#c9803a", tagline: "Whiskey and good times", default_prize: "a round on us", sort_order: 4, active: true, logo_url: null },
        { id: "v5", name: "The Reveler", slug: "reveler", color_primary: "#004c54", color_accent: "#a5acaf", tagline: "Chicago's Eagles bar", default_prize: "a round on us", sort_order: 5, active: true, logo_url: null },
        { id: "v6", name: "Blue Bayou", slug: "blue-bayou", color_primary: "#0b4f6c", color_accent: "#c9a227", tagline: "Laissez les bons temps rouler", default_prize: "a round on us", sort_order: 6, active: true, logo_url: null },
      ],
      games: [{ key: "race", name: "Mascot Race", description: "Guests pick a racer. The racers run. Everyone who picked the winner gets the prize.", sort_order: 1, active: true,
        options: [{ id: "hotdog", label: "Hot Dog", emoji: "🌭" }, { id: "beer", label: "Beer", emoji: "🍺" }, { id: "pretzel", label: "Pretzel", emoji: "🥨" }, { id: "pizza", label: "Pizza", emoji: "🍕" }] }],
      rounds: [], entries: [],
    };
    const persist = () => save(state);
    // Other tabs (the guest phones in a preview) write to the same localStorage, so re-read before every call.
    const sync = () => { const s = load(); if (s) state = s; };
    const me = () => state.profiles.find((p) => p.id === state.session);
    const requireAuth = () => { if (!me()) throw new Error("Not signed in"); };
    const requireAdmin = () => { requireAuth(); if (me().role !== "admin") throw new Error("Admin only"); };
    const round = (id) => state.rounds.find((r) => r.id === id);
    const api = {
      mock: true,
      async signIn(username, password) {
        await sleep(200);
        const p = state.profiles.find((x) => x.username === String(username).trim().toLowerCase() && x.password === password && x.active);
        if (!p) throw new Error("Wrong username or password.");
        state.session = p.id; persist(); return this.me();
      },
      async signOut() { state.session = null; persist(); },
      async me() { const p = me(); return p ? { id: p.id, username: p.username, role: p.role } : null; },
      async listVenues() { return state.venues.filter((v) => v.active).sort((a, b) => a.sort_order - b.sort_order); },
      async listAllVenues() { return [...state.venues].sort((a, b) => a.sort_order - b.sort_order); },
      async listGames() { return state.games.filter((g) => g.active); },
      async createRound({ venue_id, game_key, prize }) {
        requireAuth();
        const r = { id: uuid(), code: makeCode(), venue_id, game_key, prize: prize || null, status: "open", winning_pick: null, created_by: me().id, created_at: new Date().toISOString(), started_at: null, finished_at: null };
        state.rounds.push(r); persist(); return r;
      },
      async setRoundStatus(id, status) { requireAuth(); const r = round(id); r.status = status; if (status === "running") r.started_at = new Date().toISOString(); persist(); return r; },
      async finishRound(id, winning_pick) {
        requireAuth(); const r = round(id); r.status = "finished"; r.winning_pick = winning_pick; r.finished_at = new Date().toISOString();
        state.entries.filter((e) => e.round_id === id).forEach((e) => (e.is_winner = e.pick === winning_pick));
        state.prizes = state.prizes || [];
        const v = state.venues.find((x) => x.id === r.venue_id);
        const d0 = new Date(); d0.setHours(0, 0, 0, 0); const from = new Date(d0.getTime() + 864e5), to = new Date(d0.getTime() + 15 * 864e5);
        state.entries.filter((e) => e.round_id === id && e.is_winner).forEach((e) => { if (!state.prizes.some((p) => p.entry_id === e.id)) state.prizes.push({ id: uuid(), entry_id: e.id, round_id: r.id, won_venue_id: r.venue_id, phone: e.phone, name: e.name, prize: r.prize || v.default_prize || "a prize", issued_at: new Date().toISOString(), valid_from: (window.__mockNoWait ? new Date(0) : from).toISOString(), expires_at: to.toISOString(), redeemed_at: null, redeemed_by: null, redeemed_venue_id: null, voided_at: null }); });
        persist();
      },
      _prizeStatus(p) { const now = Date.now(); return p.voided_at ? "voided" : p.redeemed_at ? "redeemed" : now < Date.parse(p.valid_from) ? "not_yet" : now > Date.parse(p.expires_at) ? "expired" : "active"; },
      _prizeRow(p) { const v = state.venues.find((x) => x.id === p.won_venue_id), rv = state.venues.find((x) => x.id === p.redeemed_venue_id), r = round(p.round_id), g = state.games.find((x) => x.key === r.game_key), by = state.profiles.find((x) => x.id === p.redeemed_by);
        return { ...p, won_at: p.issued_at, won_venue: v?.name, game: g?.name, round_code: r?.code, status: this._prizeStatus(p), redeemed_venue: rv?.name || null, redeemed_by: by?.username || null }; },
      async lookupPrizes(phone) { requireAuth(); if (!["manager", "admin"].includes(me().role)) throw new Error("Manager login required."); const d = normPhone(phone); return (state.prizes || []).filter((p) => p.phone === d).map((p) => this._prizeRow(p)).sort((a, b) => b.issued_at.localeCompare(a.issued_at)); },
      async redeemPrize(id, venue_id) {
        requireAuth(); if (!["manager", "admin"].includes(me().role)) return { ok: false, error: "Manager login required." };
        const p = (state.prizes || []).find((x) => x.id === id); if (!p) return { ok: false, error: "Prize not found." };
        const st = this._prizeStatus(p); if (st === "redeemed") return { ok: false, error: "Already redeemed." }; if (st === "not_yet") return { ok: false, error: "Not valid until tomorrow." }; if (st === "expired") return { ok: false, error: "This prize has expired." }; if (st === "voided") return { ok: false, error: "This prize was voided." };
        p.redeemed_at = new Date().toISOString(); p.redeemed_by = me().id; p.redeemed_venue_id = venue_id; persist(); return { ok: true };
      },
      _short(n) { const p = String(n).trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; },
      async leaderboard(venue_id, kind, limit = 10) {
        requireAuth(); const today = new Date().toDateString(); const season = (state.seasons || [])[0];
        const rows = state.entries.map((e) => ({ e, r: round(e.round_id) })).filter(({ r }) => r.status === "finished")
          .filter(({ e, r }) => kind === "night" ? (r.venue_id === venue_id && new Date(e.created_at).toDateString() === today) : (!season || (e.created_at.slice(0, 10) >= season.starts_on && e.created_at.slice(0, 10) <= season.ends_on)));
        const m = {}; rows.forEach(({ e }) => { const a = m[e.phone] || (m[e.phone] = { display_name: this._short(e.name), points: 0, wins: 0, plays: 0, last: e.created_at }); a.points += 1 + (e.is_winner ? 10 : 0); a.wins += e.is_winner ? 1 : 0; a.plays++; if (e.created_at > a.last) { a.last = e.created_at; a.display_name = this._short(e.name); } });
        return Object.values(m).sort((a, b) => b.points - a.points || b.wins - a.wins || a.last.localeCompare(b.last)).slice(0, limit).map((a, i) => ({ rank: i + 1, ...a }));
      },
      async currentSeason() { return (state.seasons || [])[0] || null; },
      async listSeasons() { requireAdmin(); return [...(state.seasons || [])].sort((a, b) => b.starts_on.localeCompare(a.starts_on)); },
      async saveSeason(sn) { requireAdmin(); state.seasons = state.seasons || []; if (sn.id) Object.assign(state.seasons.find((x) => x.id === sn.id), sn); else state.seasons.push({ ...sn, id: uuid() }); persist(); },
      async deleteSeason(id) { requireAdmin(); state.seasons = state.seasons.filter((x) => x.id !== id); persist(); },
      async listPrizes(f = {}) { requireAdmin(); return (state.prizes || []).map((p) => this._prizeRow(p)).filter((p) => (!f.status || p.status === f.status) && (!f.venue_id || p.won_venue_id === f.venue_id)).sort((a, b) => b.issued_at.localeCompare(a.issued_at)); },
      async voidPrize(id, reason) { requireAdmin(); const p = state.prizes.find((x) => x.id === id); p.voided_at = new Date().toISOString(); p.void_reason = reason || null; persist(); },
      async roundStats(id) {
        requireAuth();
        const es = state.entries.filter((e) => e.round_id === id);
        const byPick = {}; es.forEach((e) => (byPick[e.pick] = (byPick[e.pick] || 0) + 1));
        return { count: es.length, byPick, winners: es.filter((e) => e.is_winner).map((e) => e.name) };
      },
      async getRoundPublic(code) {
        const r = state.rounds.find((x) => x.code === String(code).toUpperCase()); if (!r) return null;
        const v = state.venues.find((x) => x.id === r.venue_id); const g = state.games.find((x) => x.key === r.game_key);
        return { code: r.code, status: r.status, prize: r.prize || v.default_prize, venue: v, game: g };
      },
      async submitEntry({ code, name, phone, pick, opt_in, opt_in_text }) {
        await sleep(300);
        const r = state.rounds.find((x) => x.code === String(code).toUpperCase());
        if (!r) return { ok: false, error: "That game code was not found." };
        if (r.status !== "open") return { ok: false, error: "Entries are closed for this game." };
        const digits = normPhone(phone);
        if (digits.length !== 10) return { ok: false, error: "Please enter a valid 10-digit US phone number." };
        if (String(name || "").trim().length < 2) return { ok: false, error: "Please enter your name." };
        const g = state.games.find((x) => x.key === r.game_key);
        if (!g.options.some((o) => o.id === pick)) return { ok: false, error: "Please pick one of the options." };
        const ex = state.entries.find((e) => e.round_id === r.id && e.phone === digits);
        if (ex) { ex.pick = pick; ex.name = name.trim(); ex.sms_opt_in = ex.sms_opt_in || !!opt_in; }
        else state.entries.push({ id: uuid(), round_id: r.id, name: name.trim(), phone: digits, pick, sms_opt_in: !!opt_in, opt_in_text, is_winner: false, texted: false, notes: null, created_at: new Date().toISOString() });
        persist(); return { ok: true };
      },
      // ----- admin -----
      async listEntries(f = {}) {
        requireAdmin();
        return state.entries.map((e) => { const r = round(e.round_id); const v = state.venues.find((x) => x.id === r.venue_id); const g = state.games.find((x) => x.key === r.game_key);
          return { ...e, venue: v.name, venue_id: v.id, game: g.name, game_key: g.key, round_code: r.code, round_id: r.id, prize: r.prize || v.default_prize }; })
          .filter((e) => (!f.venue_id || e.venue_id === f.venue_id) && (!f.game_key || e.game_key === f.game_key) && (!f.from || e.created_at >= f.from) && (!f.to || e.created_at <= f.to) && (!f.winners || e.is_winner) && (!f.opt_in || e.sms_opt_in) && (!f.untexted || !e.texted))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async listContacts(f = {}) {
        requireAdmin();
        const m = {};
        state.entries.forEach((e) => { const r = round(e.round_id); const v = state.venues.find((x) => x.id === r.venue_id);
          const c = m[e.phone] || (m[e.phone] = { phone: e.phone, name: e.name, sms_opt_in: false, first_seen: e.created_at, last_seen: e.created_at, entries: 0, wins: 0, venues: new Set() });
          c.sms_opt_in = c.sms_opt_in || e.sms_opt_in; c.entries++; if (e.is_winner) c.wins++; c.venues.add(v.name); if (e.created_at > c.last_seen) { c.last_seen = e.created_at; c.name = e.name; } if (e.created_at < c.first_seen) c.first_seen = e.created_at; });
        return Object.values(m).map((c) => ({ ...c, venues: [...c.venues].join(", ") })).filter((c) => !f.opt_in || c.sms_opt_in).sort((a, b) => b.last_seen.localeCompare(a.last_seen));
      },
      async updateEntry(id, patch) { requireAdmin(); Object.assign(state.entries.find((e) => e.id === id), patch); persist(); },
      async deleteEntry(id) { requireAdmin(); state.entries = state.entries.filter((e) => e.id !== id); persist(); },
      async listRounds(limit = 50) { requireAuth(); return [...state.rounds].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((r) => ({ ...r, venue: state.venues.find((v) => v.id === r.venue_id).name, game: state.games.find((g) => g.key === r.game_key).name, entries: state.entries.filter((e) => e.round_id === r.id).length })); },
      async listUsers() { requireAdmin(); return state.profiles.map(({ password, ...p }) => p); },
      async createUser(username, password, role) { requireAdmin(); const u = String(username).trim().toLowerCase(); if (state.profiles.some((p) => p.username === u)) throw new Error("That username is taken."); state.profiles.push({ id: uuid(), username: u, password, role, active: true }); persist(); },
      async updateUser(id, patch) { requireAdmin(); Object.assign(state.profiles.find((p) => p.id === id), patch); persist(); },
      async updateVenue(id, patch) { requireAdmin(); Object.assign(state.venues.find((v) => v.id === id), patch); persist(); },
      async uploadLogo(venue, file) { requireAdmin(); const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); }); await this.updateVenue(venue.id, { logo_url: url }); return url; },
      async updateGameOptions(key, options) { requireAdmin(); state.games.find((g) => g.key === key).options = options; persist(); },
      async uploadRacerImage(optionId, file) { requireAdmin(); return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); }); },
    };
    // Re-sync from storage before every call so multiple preview tabs see each other's writes.
    Object.keys(api).forEach((k) => { if (typeof api[k] === "function" && !k.startsWith("_")) { const fn = api[k]; api[k] = function (...a) { sync(); return fn.apply(api, a); }; } });
    return api;
  }

  // ---------------- SUPABASE BACKEND ----------------
  function supabaseApi() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const throwIf = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    let cachedMe = null;
    return {
      mock: false, sb,
      async signIn(username, password) {
        throwIf(await sb.auth.signInWithPassword({ email: usernameToEmail(username), password }));
        cachedMe = null; const m = await this.me(); if (!m) throw new Error("This account is disabled."); return m;
      },
      async signOut() { await sb.auth.signOut(); cachedMe = null; },
      async me() {
        if (cachedMe) return cachedMe;
        const { data: { session } } = await sb.auth.getSession(); if (!session) return null;
        const p = throwIf(await sb.from("profiles").select("id, username, role, active").eq("id", session.user.id).maybeSingle());
        if (!p || !p.active) { await sb.auth.signOut(); return null; }
        return (cachedMe = p);
      },
      async listVenues() { return throwIf(await sb.from("venues").select("*").eq("active", true).order("sort_order")); },
      async listAllVenues() { return throwIf(await sb.from("venues").select("*").order("sort_order")); },
      async listGames() { return throwIf(await sb.from("games").select("*").eq("active", true).order("sort_order")); },
      async createRound({ venue_id, game_key, prize }) {
        const me = await this.me();
        for (let i = 0; i < 5; i++) {
          const { data, error } = await sb.from("rounds").insert({ code: makeCode(), venue_id, game_key, prize: prize || null, created_by: me.id }).select().single();
          if (!error) return data; if (!/duplicate/i.test(error.message)) throw new Error(error.message);
        }
        throw new Error("Could not create a game code, try again.");
      },
      async setRoundStatus(id, status) { const patch = { status }; if (status === "running") patch.started_at = new Date().toISOString(); return throwIf(await sb.from("rounds").update(patch).eq("id", id).select().single()); },
      async finishRound(id, winning_pick) { throwIf(await sb.rpc("finish_round", { p_round_id: id, p_winning_pick: winning_pick })); },
      async roundStats(id) {
        const rows = throwIf(await sb.from("entries").select("pick, name, is_winner").eq("round_id", id));
        const byPick = {}; rows.forEach((e) => (byPick[e.pick] = (byPick[e.pick] || 0) + 1));
        return { count: rows.length, byPick, winners: rows.filter((e) => e.is_winner).map((e) => e.name) };
      },
      async getRoundPublic(code) { return throwIf(await sb.rpc("get_round_public", { p_code: code })); },
      async submitEntry({ code, name, phone, pick, opt_in, opt_in_text }) {
        return throwIf(await sb.rpc("submit_entry", { p_code: code, p_name: name, p_phone: phone, p_pick: pick, p_opt_in: !!opt_in, p_opt_in_text: opt_in_text, p_user_agent: navigator.userAgent }));
      },
      async listEntries(f = {}) {
        let q = sb.from("entries_export").select("*").order("created_at", { ascending: false }).limit(5000);
        if (f.venue_id) q = q.eq("venue_id", f.venue_id); if (f.game_key) q = q.eq("game_key", f.game_key);
        if (f.from) q = q.gte("created_at", f.from); if (f.to) q = q.lte("created_at", f.to);
        if (f.winners) q = q.eq("is_winner", true); if (f.opt_in) q = q.eq("sms_opt_in", true); if (f.untexted) q = q.eq("texted", false);
        return throwIf(await q);
      },
      async listContacts(f = {}) { let q = sb.from("contacts_export").select("*").order("last_seen", { ascending: false }).limit(20000); if (f.opt_in) q = q.eq("sms_opt_in", true); return throwIf(await q); },
      async updateEntry(id, patch) { throwIf(await sb.from("entries").update(patch).eq("id", id)); },
      async deleteEntry(id) { throwIf(await sb.from("entries").delete().eq("id", id)); },
      async listRounds(limit = 50) {
        const rows = throwIf(await sb.from("rounds").select("*, venues(name), games(name), entries(count)").order("created_at", { ascending: false }).limit(limit));
        return rows.map((r) => ({ ...r, venue: r.venues?.name, game: r.games?.name, entries: r.entries?.[0]?.count ?? 0 }));
      },
      async listUsers() { return throwIf(await sb.from("profiles").select("id, username, role, active, created_at").order("created_at")); },
      async createUser(username, password, role) {
        // A second client so creating an account does not replace the admin's own session.
        const tmp = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        const u = String(username).trim().toLowerCase();
        const { data, error } = await tmp.auth.signUp({ email: usernameToEmail(u), password, options: { data: { username: u } } });
        if (error) throw new Error(error.message);
        if (!data.user) throw new Error("Account not created.");
        if (role === "admin") { await sleep(500); throwIf(await sb.from("profiles").update({ role: "admin" }).eq("id", data.user.id)); }
      },
      async updateUser(id, patch) { throwIf(await sb.from("profiles").update(patch).eq("id", id)); },
      async updateVenue(id, patch) { throwIf(await sb.from("venues").update(patch).eq("id", id)); },
      async uploadLogo(venue, file) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${venue.slug}.${ext}`;
        throwIf(await sb.storage.from("logos").upload(path, file, { upsert: true, contentType: file.type }));
        const url = sb.storage.from("logos").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
        await this.updateVenue(venue.id, { logo_url: url }); return url;
      },
      async updateGameOptions(key, options) { throwIf(await sb.from("games").update({ options }).eq("key", key)); },
      async lookupPrizes(phone) { return throwIf(await sb.rpc("lookup_prizes", { p_phone: phone })); },
      async leaderboard(venue_id, kind, limit = 10) { return throwIf(await sb.rpc("leaderboard", { p_venue_id: venue_id, p_kind: kind, p_limit: limit })); },
      async currentSeason() { const r = throwIf(await sb.rpc("current_season")); return Array.isArray(r) ? r[0] || null : r; },
      async listSeasons() { return throwIf(await sb.from("seasons").select("*").order("starts_on", { ascending: false })); },
      async saveSeason(sn) { if (sn.id) throwIf(await sb.from("seasons").update({ name: sn.name, starts_on: sn.starts_on, ends_on: sn.ends_on }).eq("id", sn.id)); else throwIf(await sb.from("seasons").insert({ name: sn.name, starts_on: sn.starts_on, ends_on: sn.ends_on })); },
      async deleteSeason(id) { throwIf(await sb.from("seasons").delete().eq("id", id)); },
      async redeemPrize(id, venue_id) { return throwIf(await sb.rpc("redeem_prize", { p_prize_id: id, p_venue_id: venue_id })); },
      async listPrizes(f = {}) { let q = sb.from("prizes_report").select("*").order("issued_at", { ascending: false }).limit(5000); if (f.status) q = q.eq("status", f.status); if (f.venue_id) q = q.eq("won_venue_id", f.venue_id); return throwIf(await q); },
      async voidPrize(id, reason) { throwIf(await sb.from("prizes").update({ voided_at: new Date().toISOString(), void_reason: reason || null }).eq("id", id)); },
      async uploadRacerImage(optionId, file) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `racers/${optionId}.${ext}`;
        throwIf(await sb.storage.from("logos").upload(path, file, { upsert: true, contentType: file.type }));
        return sb.storage.from("logos").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
      },
    };
  }

  const api = MOCK ? mockApi() : supabaseApi();
  window.BG = { api, MOCK, CFG, $, $$, esc, sleep, fmtPhone, normPhone, entryUrl, decorateOptions };
})();
