// sms: the one place that talks to Twilio.
//   POST /sms            nudge from the database (x-lctg-secret) or the cron sweep: drain queued messages
//   POST /sms/status     Twilio delivery status callback (signature-checked)
//   POST /sms/inbound    Twilio inbound message webhook (signature-checked): STOP/START handling, logged
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (E.164). Until they exist, messages stay queued.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const FROM = Deno.env.get("TWILIO_FROM") ?? "";
const PUBLIC_BASE = (Deno.env.get("SMS_PUBLIC_URL") ?? `${SB_URL}/functions/v1/sms`).replace(/\/$/, "");
const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const twiml = () => new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

async function setting(key: string): Promise<string> {
  const { data } = await db.rpc("sms_setting", { p_key: key });
  return (data as string | null) ?? "";
}

// Twilio request signature: base64(HMAC-SHA1(authToken, url + sorted form params concatenated))
async function twilioSignatureOk(req: Request, url: string, form: URLSearchParams): Promise<boolean> {
  if (!TOKEN) return false;
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const keys = [...form.keys()].sort();
  const payload = url + keys.map((k) => k + form.get(k)).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(TOKEN), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === sig;
}

async function sendOne(m: { id: string; phone: string; body: string }) {
  const to = "+1" + m.phone;
  const params = new URLSearchParams({ To: to, From: FROM, Body: m.body, StatusCallback: PUBLIC_BASE + "/status" });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST", headers: { Authorization: "Basic " + btoa(`${SID}:${TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: params,
  });
  const out = await r.json().catch(() => ({}));
  if (r.ok && out.sid) {
    await db.rpc("sms_mark", { p_id: m.id, p_status: "sent", p_sid: out.sid, p_error: null, p_segments: out.num_segments ? Number(out.num_segments) : null });
    return true;
  }
  await db.rpc("sms_mark", { p_id: m.id, p_status: "failed", p_sid: out.sid ?? null, p_error: `${out.code ?? r.status}: ${out.message ?? "send failed"}`, p_segments: null });
  return false;
}

async function drain(): Promise<{ sent: number; failed: number; left: number }> {
  let sent = 0, failed = 0; const t0 = Date.now();
  if (!SID || !TOKEN || !FROM) return { sent, failed, left: -1 };   // not configured yet: leave everything queued
  while (Date.now() - t0 < 45_000) {
    const { data: batch, error } = await db.rpc("sms_claim_batch", { p_limit: 20 });
    if (error) throw error;
    if (!batch || batch.length === 0) break;
    for (const m of batch) { try { (await sendOne(m)) ? sent++ : failed++; } catch (e) { failed++; await db.rpc("sms_mark", { p_id: m.id, p_status: "failed", p_sid: null, p_error: String(e).slice(0, 300), p_segments: null }); } }
  }
  await db.rpc("sms_after_drain");
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("status", "queued");
  return { sent, failed, left: count ?? 0 };
}

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname.replace(/^.*\/sms/, "") || "/";
  if (req.method !== "POST") return json({ ok: true, service: "sms" });

  if (path === "/status" || path === "/inbound") {
    const form = new URLSearchParams(await req.text());
    const ok = await twilioSignatureOk(req, PUBLIC_BASE + path, form);
    if (!ok) return json({ ok: false, error: "bad signature" }, 403);
    if (path === "/status") {
      await db.rpc("sms_status", { p_sid: form.get("MessageSid"), p_status: form.get("MessageStatus"), p_error: form.get("ErrorCode") ? `${form.get("ErrorCode")} ${form.get("ErrorMessage") ?? ""}`.trim() : null });
      return twiml();
    }
    await db.rpc("sms_inbound", { p_from: form.get("From") ?? "", p_body: form.get("Body") ?? "", p_sid: form.get("MessageSid") ?? "" });
    return twiml();   // empty reply; Twilio's own opt-out handling sends the STOP confirmation
  }

  // nudge / sweep: shared secret from the database
  const secret = await setting("sms_webhook_secret");
  if (!secret || req.headers.get("x-lctg-secret") !== secret) return json({ ok: false, error: "unauthorized" }, 401);
  try { return json({ ok: true, ...(await drain()) }); } catch (e) { return json({ ok: false, error: String(e) }, 500); }
});
