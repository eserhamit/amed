"use strict";
// Tests de bout en bout : parcours clients, espace gérant et contrôles de sécurité.
process.env.NODE_ENV = "test";
process.env.UPLOAD_DIR = require("path").join(require("os").tmpdir(), "goudale-test-uploads-" + process.pid);
const test = require("node:test");
const assert = require("node:assert/strict");
const { authenticator } = require("otplib");
const sharp = require("sharp");
const db = require("../src/db");
const seed = require("../scripts/seed");
const sec = require("../src/lib/security");
const { outbox } = require("../src/lib/notify");
const U = require("../src/lib/util");
const { createApp } = require("../src/app");

let server, base;
class Client {
  constructor() { this.jar = {}; }
  cookie() { return Object.entries(this.jar).map(([k, v]) => k + "=" + v).join("; "); }
  async req(path, opts = {}) {
    const headers = { ...(opts.headers || {}), cookie: this.cookie() };
    let body = opts.body;
    if (opts.form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(opts.form).toString(); }
    if (opts.method === "POST" && !headers.origin && !opts.noOrigin) headers.origin = base;
    const r = await fetch(base + path, { method: opts.method || "GET", headers, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1); if (v) this.jar[kv.slice(0, i)] = v; else delete this.jar[kv.slice(0, i)]; }
    r.text_ = await r.text();
    return r;
  }
  async page(path) { const r = await this.req(path); this.csrf = (r.text_.match(/name="_csrf" value="([^"]+)"/) || [])[1]; this.ts = (r.text_.match(/name="ts" value="([^"]+)"/) || [])[1]; return r; }
  post(path, form, extra = {}) { return this.req(path, { method: "POST", form: { _csrf: this.csrf, ts: this.ts, ...form }, ...extra }); }
}
const day = n => U.addDays(U.today(), n);
let resaDate; // un mardi à venir (horaires 11:30 – 00:00)

test.before(async () => {
  await seed();
  await db("pubs").where({ id: "tourelle" }).update({ hours: JSON.stringify(["11:00 – 23:00", "11:00 – 23:00", "11:00 – 23:00", "11:00 – 23:00", "11:00 – 23:00", "11:00 – 23:00", "Fermé"]) });
  for (let i = 1; i < 9; i++) if (U.dayIdxOf(day(i)) === 1) { resaDate = day(i); break; }
  await new Promise(r => { server = createApp().listen(0, r); });
  base = "http://localhost:" + server.address().port;
});
test.after(async () => { server.close(); await db.destroy(); });

test("pages publiques, en-têtes de sécurité et référencement", async () => {
  const c = new Client();
  const home = await c.req("/fr");
  assert.equal(home.status, 200);
  const csp = home.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/); assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(home.headers.get("x-powered-by"), null);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.match(home.text_, /hreflang="en"/); assert.match(home.text_, /application\/ld\+json/); assert.match(home.text_, /BarOrPub/);
  assert.doesNotMatch(home.text_, /fonts\.googleapis/);
  const en = await c.req("/en"); assert.match(en.text_, /Book a table/);
  assert.equal((await c.req("/fr/ce-soir")).status, 200);
  assert.equal((await c.req("/en/concorde")).status, 200);
  assert.equal((await c.req("/fr/confidentialite")).status, 200);
  assert.match((await c.req("/sitemap.xml")).text_, /<loc>http:\/\/localhost:3000\/en\/ce-soir<\/loc>/);
  assert.match((await c.req("/robots.txt")).text_, /Disallow: \/admin/);
  assert.equal((await c.req("/fr/inexistant")).status, 404);
  assert.equal((await c.req("/static/../package.json")).status, 404);
});

test("réservation : CSRF, origine, robots, horaires et capacité", async () => {
  const c = new Client(); await c.page("/fr");
  const good = { pub: "chatelaine", date: resaDate, time: "19:30", persons: "4", occasion: "Repas", name: "Léa Martin", phone: "079 123 45 67", email: "lea@example.ch", note: "" };
  assert.equal((await c.req("/fr/reserver", { method: "POST", form: { ...good, ts: c.ts } })).status, 403, "sans jeton CSRF");
  assert.equal((await c.post("/fr/reserver", good, { headers: { origin: "https://evil.example" } })).status, 403, "origine étrangère");
  const bot = await c.post("/fr/reserver", { ...good, website: "http://spam" }); assert.equal(bot.status, 422);
  const closed = await c.post("/fr/reserver", { ...good, time: "09:00" }); assert.equal(closed.status, 422); assert.match(closed.text_, /fermé à cette heure/);
  const badPhone = await c.post("/fr/reserver", { ...good, phone: "abc" }); assert.equal(badPhone.status, 422);
  const noMail = await c.post("/fr/reserver", { ...good, email: "" }); assert.equal(noMail.status, 422, "e-mail obligatoire");

  const ok = await c.post("/fr/reserver", good);
  assert.equal(ok.status, 303);
  const loc = ok.headers.get("location"); assert.match(loc, /^\/fr\/reservation\/[A-Za-z0-9_-]{32}\?ok=resaSent$/);
  const st = await c.req(loc); assert.match(st.text_, /En attente de confirmation/); assert.equal(st.headers.get("x-robots-tag"), "noindex");
  const r = await db("reservations").orderBy("id", "desc").first(); assert.equal(r.phone, "+41791234567");
  assert.ok(outbox.some(m => m.type === "mail" && m.to === "lea@example.ch"));

  await db("pubs").where({ id: "chatelaine" }).update({ cap_soir: 6 });
  require("../src/lib/content").invalidate();
  const full = await c.post("/fr/reserver", { ...good, persons: "3" });
  assert.equal(full.status, 422); assert.match(full.text_, /Il ne reste que 2 place/);
  const avail = JSON.parse((await c.req("/api/disponibilite?pub=chatelaine&date=" + resaDate + "&time=20:00")).text_);
  assert.equal(avail.left, 2);
  await db("pubs").where({ id: "chatelaine" }).update({ cap_soir: null }); require("../src/lib/content").invalidate();

  // Annulation par le client
  await c.page(loc.split("?")[0]);
  const cancel = await c.post(loc.split("?")[0] + "/annuler", {}); assert.equal(cancel.status, 303);
  assert.equal((await db("reservations").where({ id: r.id }).first()).status, "cancelled");
});

test("injection HTML : les saisies sont échappées partout", async () => {
  const c = new Client(); await c.page("/fr");
  const res = await c.post("/fr/reserver", { pub: "chatelaine", date: resaDate, time: "20:00", persons: "2", name: "<script>alert(1)</script>", phone: "0791112233", email: "xss@example.ch", note: "<img src=x onerror=alert(2)>" });
  assert.equal(res.status, 303);
  const page = await c.req(res.headers.get("location"));
  assert.doesNotMatch(page.text_, /<script>alert\(1\)/); assert.match(page.text_, /&lt;script&gt;alert\(1\)/);
});

async function login(email, pw) {
  const c = new Client(); await c.page("/admin/login");
  const r = await c.post("/admin/login", { email, password: pw });
  return { c, r };
}

test("espace gérant : connexion, verrouillage, statuts et SMS", async () => {
  await db("users").insert({ email: "patron@goudale.test", name: "Patron", role: "owner", password_hash: sec.hashPassword("une phrase longue et sûre 42"), created_at: Date.now() });
  const anon = new Client();
  assert.equal((await anon.req("/admin")).headers.get("location"), "/admin/login");
  assert.equal((await anon.req("/admin/reglages")).headers.get("location"), "/admin/login");

  const bad = await login("patron@goudale.test", "mauvais mot de passe 1");
  assert.equal(bad.r.status, 401);
  const unknown = await login("personne@goudale.test", "mauvais mot de passe 1");
  assert.equal(unknown.r.status, 401); assert.equal(unknown.r.text_.includes("incorrect"), bad.r.text_.includes("incorrect"), "même message pour un compte inconnu");

  const { c, r } = await login("patron@goudale.test", "une phrase longue et sûre 42");
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/admin");
  const dash = await c.page("/admin?when=all");
  assert.equal(dash.status, 200); assert.equal(dash.headers.get("cache-control"), "no-store");
  assert.match(dash.text_, /&lt;script&gt;alert\(1\)/); assert.doesNotMatch(dash.text_, /<script>alert\(1\)/);

  const resa = await db("reservations").where({ status: "pending" }).first();
  const before = outbox.length;
  const conf = await c.post("/admin/reservations/" + resa.id + "/status", { status: "confirmed" });
  assert.equal(conf.status, 302);
  assert.equal((await db("reservations").where({ id: resa.id }).first()).status, "confirmed");
  assert.ok(outbox.slice(before).some(m => m.type === "mail" && m.to === resa.email && /confirmée/i.test(m.subject)), "confirmation envoyée par e-mail");
  assert.ok(!outbox.slice(before).some(m => m.type === "sms"), "aucun SMS");
  const illegal = await c.post("/admin/reservations/" + resa.id + "/status", { status: "declined" });
  assert.equal(illegal.status, 302);
  assert.equal((await db("reservations").where({ id: resa.id }).first()).status, "confirmed", "transition interdite refusée");
  assert.ok((await db("audit_log").where({ action: "resa.confirmed" })).length >= 1);

  // Verrouillage après 5 erreurs
  await db("users").insert({ email: "victime@goudale.test", name: "V", role: "manager", pub_id: "tourelle", password_hash: sec.hashPassword("autre phrase longue 7788"), created_at: Date.now() });
  for (let i = 0; i < 5; i++) await login("victime@goudale.test", "faux mot de passe " + i);
  const locked = await login("victime@goudale.test", "autre phrase longue 7788");
  assert.equal(locked.r.status, 401); assert.match(locked.r.text_, /verrouill|Trop de tentatives/);
});

test("rôles : un gérant ne voit que son pub et pas les réglages", async () => {
  await db("users").insert({ email: "gerant@goudale.test", name: "Gérant Tourelle", role: "manager", pub_id: "tourelle", password_hash: sec.hashPassword("gerant phrase longue 2026"), created_at: Date.now() });
  const { c } = await login("gerant@goudale.test", "gerant phrase longue 2026");
  const dash = await c.page("/admin?when=all");
  assert.doesNotMatch(dash.text_, /Léa Martin/, "réservations de Châtelaine invisibles");
  assert.equal((await c.req("/admin/reglages")).status, 403);
  assert.equal((await c.req("/admin/utilisateurs")).status, 403);
  const chat = await db("reservations").where({ pub_id: "chatelaine", status: "confirmed" }).first();
  await c.post("/admin/reservations/" + chat.id + "/status", { status: "noshow" });
  assert.equal((await db("reservations").where({ id: chat.id }).first()).status, "confirmed");
});

test("double authentification : activation, connexion et anti-rejeu", async () => {
  const { c } = await login("patron@goudale.test", "une phrase longue et sûre 42");
  const acc = await c.page("/admin/compte");
  const secret = acc.text_.match(/<span class="mono">([A-Z2-7 ]{20,})<\/span>/)[1].replace(/ /g, "");
  const on = await c.post("/admin/compte/2fa", { code: authenticator.generate(secret) });
  assert.equal(on.headers.get("location"), "/admin");
  const u = await db("users").where({ email: "patron@goudale.test" }).first();
  assert.ok(u.totp_enabled); assert.doesNotMatch(u.totp_secret_enc, new RegExp(secret), "secret chiffré en base");

  const step1 = await login("patron@goudale.test", "une phrase longue et sûre 42");
  assert.equal(step1.r.headers.get("location"), "/admin/2fa");
  assert.equal((await step1.c.req("/admin")).headers.get("location"), "/admin/login", "pas d'accès avant le code");
  await step1.c.page("/admin/2fa");
  assert.equal((await step1.c.post("/admin/2fa", { code: "000000" })).status, 401);
  const code = authenticator.generate(secret);
  const okr = await step1.c.post("/admin/2fa", { code });
  assert.equal(okr.headers.get("location"), "/admin");
  const replay = await login("patron@goudale.test", "une phrase longue et sûre 42");
  await replay.c.page("/admin/2fa");
  assert.equal((await replay.c.post("/admin/2fa", { code })).status, 401, "un code déjà utilisé est refusé");
});

test("newsletter : double confirmation et désinscription en un clic", async () => {
  const c = new Client(); await c.page("/fr");
  const r = await c.req("/fr/newsletter", { method: "POST", body: new URLSearchParams([["_csrf", c.csrf], ["ts", c.ts], ["email", "Client@Example.ch"], ["pubs", "chatelaine"], ["pubs", "tourelle"]]).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(r.status, 303);
  const s = await db("subscribers").where({ email: "client@example.ch" }).first();
  assert.equal(s.status, "pending");
  const mail = outbox.filter(m => m.to === "client@example.ch").pop();
  const link = mail.text.match(/(\/fr\/newsletter\/confirmer\/[A-Za-z0-9_-]+)/)[1];
  await c.req(link);
  assert.equal((await db("subscribers").where({ id: s.id }).first()).status, "confirmed");
  const one = await c.req("/fr/newsletter/desinscription/" + s.token, { method: "POST", form: { "List-Unsubscribe": "One-Click" }, noOrigin: true });
  assert.equal(one.status, 200);
  assert.equal(await db("subscribers").where({ id: s.id }).first(), undefined);
});

test("fidélité : carte par e-mail, tampons et limite quotidienne", async () => {
  const c = new Client(); await c.page("/fr");
  assert.equal((await c.post("/fr/fidelite", { email: "fidele@example.ch" })).status, 303);
  const card = await db("loyalty_cards").where({ email: "fidele@example.ch" }).first();
  assert.match(card.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const page = await c.req("/fr/fidelite/" + card.token);
  assert.match(page.text_, new RegExp(card.code)); assert.match(page.text_, /<svg/);
  assert.equal((await c.post("/fr/fidelite", { email: "fidele@example.ch" })).status, 303, "même réponse si la carte existe déjà");
  assert.equal((await db("loyalty_cards").where({ email: "fidele@example.ch" })).length, 1);

  await db("users").where({ email: "patron@goudale.test" }).update({ totp_enabled: false, totp_secret_enc: null });
  const { c: a } = await login("patron@goudale.test", "une phrase longue et sûre 42");
  await a.page("/admin/fidelite?code=" + card.code);
  for (let i = 0; i < 3; i++) await a.post("/admin/fidelite/" + card.id + "/stamp", { n: "2" });
  await a.post("/admin/fidelite/" + card.id + "/stamp", { n: "1" });
  assert.equal((await db("loyalty_cards").where({ id: card.id }).first()).stamps, 6, "6 tampons maximum par jour");
});

test("photos : seule une vraie image est acceptée, réencodée sans métadonnées", async () => {
  const { c } = await login("patron@goudale.test", "une phrase longue et sûre 42");
  await c.page("/admin/photos");
  const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#C47F12" } }).png().toBuffer();
  const send = async (buf, type, name) => {
    const fd = new FormData(); fd.append("_csrf", c.csrf); fd.append("slot", "hero"); fd.append("alt", "Comptoir");
    fd.append("photo", new Blob([buf], { type }), name);
    return c.req("/admin/photos", { method: "POST", body: fd });
  };
  assert.equal((await send(Buffer.from("<?php echo 1; ?>"), "image/png", "x.png")).status, 302);
  assert.equal((await db("photos")).length, 0, "un faux PNG est rejeté");
  await send(png, "image/png", "comptoir.png");
  const p = await db("photos").first();
  assert.ok(p && p.width === 1200);
  const img = await c.req("/media/" + p.file + "-800.webp");
  assert.equal(img.status, 200);
  const home = await new Client().req("/fr"); assert.match(home.text_, new RegExp(p.file + "-1600.webp"));
});

test("e-mail du lundi et purge des données", async () => {
  const nl = require("../src/lib/newsletter");
  const content = require("../src/lib/content");
  const m = nl.build(await content.load(), "fr", "https://exemple/desinscription");
  assert.match(m.html, /Menu de la semaine/); assert.match(m.html, /Carbonade flamande/); assert.match(m.html, /desinscription/);
  await db("reservations").insert({ token: sec.token(24), pub_id: "chatelaine", date: "2024-01-05", time: "19:00", service: "soir", persons: 2, name: "Ancien Client", phone: "+41790000000", email: "old@example.ch", note: "x", lang: "fr", status: "done", created_at: Date.now() - 700 * 864e5 });
  const r = await require("../src/jobs").purge();
  assert.ok(r.reservations >= 1);
  const old = await db("reservations").where({ date: "2024-01-05" }).first();
  assert.equal(old.name, "—"); assert.equal(old.phone, "—"); assert.equal(old.email, ""); assert.ok(old.anonymized);
});

test("mots de passe : politique et hachage", () => {
  assert.ok(sec.passwordProblem("court"));
  assert.ok(sec.passwordProblem("goudale123456789"));
  assert.equal(sec.passwordProblem("trois pommes vertes au soleil"), null);
  const h = sec.hashPassword("trois pommes vertes au soleil");
  assert.match(h, /^scrypt\$32768\$8\$1\$/);
  assert.ok(sec.verifyPassword("trois pommes vertes au soleil", h));
  assert.ok(!sec.verifyPassword("trois pommes vertes au soleiL", h));
});

test("premier démarrage : compte propriétaire créé depuis le .env, une seule fois", async () => {
  const config = require("../src/config");
  const bootstrap = require("../src/bootstrap");
  const saved = await db("users").select();
  await db("users").del();
  Object.assign(config, { ADMIN_EMAIL: "nouveau@goudale.test", ADMIN_NAME: "Nouveau", ADMIN_PASSWORD: "goudale" });
  await bootstrap();
  assert.equal((await db("users")).length, 0, "mot de passe trop faible refusé");
  config.ADMIN_PASSWORD = "une autre phrase bien longue 55";
  await bootstrap();
  const u = await db("users").where({ email: "nouveau@goudale.test" }).first();
  assert.equal(u.role, "owner"); assert.ok(sec.verifyPassword("une autre phrase bien longue 55", u.password_hash));
  config.ADMIN_PASSWORD = "encore une autre phrase longue 66";
  await bootstrap();
  assert.equal((await db("users")).length, 1, "aucun second compte créé");
  assert.ok(sec.verifyPassword("une autre phrase bien longue 55", (await db("users").first()).password_hash), "le mot de passe existant n'est pas écrasé");
  delete config.ADMIN_PASSWORD; delete config.ADMIN_EMAIL;
  await db("users").del(); if (saved.length) await db("users").insert(saved);
});

test("Tourelle, sociétés par pub et photos conservées en base", async () => {
  const t = await db("pubs").where({ id: "tourelle" }).first();
  assert.match(t.addr, /Chemin de la Tourelle 2/); assert.equal(t.tel, "+41 22 920 80 84"); assert.ok(!t.company, "aucune société pré-remplie");
  assert.equal(JSON.parse(t.hours)[5], "11:00 – 23:00", "des horaires déjà saisis ne sont pas écrasés");
  const legal = await new Client().req("/fr/mentions-legales");
  assert.match(legal.text_, /Chemin de la Tourelle 2/); assert.doesNotMatch(legal.text_, /Goudale Tourelle Sàrl/);
  assert.doesNotMatch((await new Client().req("/fr/confidentialite")).text_, /SMS|Twilio/);
  const p = await db("photos").first();
  assert.ok(p && p.img800 && p.img800.length > 100, "image enregistrée dans la base");
  const fs = require("fs");
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  const img = await fetch(base + "/media/" + p.file + "-1600.webp");
  assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/webp");
});
