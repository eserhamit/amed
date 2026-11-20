"use strict";
// Espace gérant : sessions serveur, mots de passe scrypt, 2FA (TOTP), rôles par pub, journal d'audit.
const express = require("express");
const session = require("express-session");
const { ConnectSessionKnexStore } = require("connect-session-knex");
const { rateLimit } = require("express-rate-limit");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs/promises");
const QRCode = require("qrcode");
const { authenticator } = require("otplib");
const db = require("../db");
const config = require("../config");
const sec = require("../lib/security");
const U = require("../lib/util");
const N = require("../lib/notify");
const content = require("../lib/content");
const booking = require("../lib/booking");
const newsletter = require("../lib/newsletter");
const { audit, hits, hit } = require("../lib/audit");
const { translator } = require("../i18n");

authenticator.options = { window: 1, step: 30 };
const router = express.Router();
const SITE = config.SITE_URL.replace(/\/$/, "");
const FR = translator("fr");

/* ---------- Session ---------- */
router.use(session({
  name: config.secure ? "__Host-gd_admin" : "gd_admin",
  secret: config.APP_SECRET,
  store: config.isTest ? undefined : new ConnectSessionKnexStore({ knex: db, tableName: "sessions", createTable: true, cleanupInterval: 15 * 60 * 1000 }),
  proxy: true, resave: false, saveUninitialized: false, rolling: true, unset: "destroy",
  cookie: { httpOnly: true, secure: config.secure, sameSite: "strict", path: "/", maxAge: 12 * 3600 * 1000 }
}));
router.use((req, res, next) => { res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex, nofollow"); next(); });
router.use(sec.csrfIssue);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 10, standardHeaders: "draft-7", legacyHeaders: false,
  handler: (req, res) => res.status(429).render("admin/login", { error: "Trop de tentatives. Réessayez dans 15 minutes.", email: "" }) });

/* ---------- Chargement de l'utilisateur connecté ---------- */
const IDLE = 2 * 3600 * 1000;
router.use(async (req, res, next) => {
  try {
    res.locals.user = null; res.locals.flash = null;
    if (req.session.flash) { res.locals.flash = req.session.flash; delete req.session.flash; }
    if (req.session.uid) {
      if (Date.now() - (req.session.seen || 0) > IDLE) { return req.session.destroy(() => res.redirect("/admin/login?expire=1")); }
      const u = await db("users").where({ id: req.session.uid }).first();
      if (!u || !u.active || u.session_version !== req.session.ver) return req.session.destroy(() => res.redirect("/admin/login"));
      req.session.seen = Date.now();
      req.user = u; res.locals.user = u;
      res.locals.pubsAll = await db("pubs").orderBy("sort");
    }
    next();
  } catch (e) { next(e); }
});

function flash(req, type, text) { req.session.flash = { type, text }; }
function needLogin(req, res, next) {
  if (!req.user) return res.redirect("/admin/login");
  // 2FA obligatoire : tant qu'elle n'est pas activée, seule la page « Mon compte » est accessible.
  if (config.require2fa && !req.user.totp_enabled && !req.path.startsWith("/compte") && req.path !== "/logout") {
    flash(req, "warn", "Activez la double authentification pour accéder à l'espace gérant.");
    return res.redirect("/admin/compte");
  }
  next();
}
function ownerOnly(req, res, next) { if (req.user.role !== "owner") { res.status(403); return res.render("admin/denied"); } next(); }
// Un gérant ne voit que son pub ; le propriétaire voit tout.
function scope(req) { return req.user.role === "owner" ? null : req.user.pub_id; }
function canPub(req, pubId) { const s = scope(req); return !s || s === pubId; }

/* ---------- Connexion ---------- */
router.get("/login", (req, res) => {
  if (req.user) return res.redirect("/admin");
  res.render("admin/login", { error: req.query.expire ? "Session expirée après 2 h d'inactivité. Reconnectez-vous." : "", email: "" });
});

router.post("/login", loginLimiter, sec.csrfVerify, async (req, res, next) => {
  try {
    const email = U.email(req.body.email) || "";
    const pw = String(req.body.password || "").slice(0, 200);
    const fail = msg => res.status(401).render("admin/login", { error: msg || "E-mail ou mot de passe incorrect.", email: U.line(req.body.email, 160) });
    if (await hits("login:" + email, 15 * 60 * 1000) >= 8) return fail("Trop de tentatives pour ce compte. Réessayez dans 15 minutes.");
    const u = email ? await db("users").where({ email }).first() : null;
    const ok = sec.verifyPassword(pw, u ? u.password_hash : null); // calcul toujours effectué (pas de fuite par le temps de réponse)
    if (u && u.locked_until && u.locked_until > Date.now()) return fail("Compte temporairement verrouillé après plusieurs erreurs. Réessayez plus tard.");
    if (!u || !u.active || !ok) {
      await hit("login:" + email);
      if (u) {
        const f = u.failed_logins + 1;
        await db("users").where({ id: u.id }).update({ failed_logins: f, locked_until: f >= 5 ? Date.now() + 15 * 60 * 1000 * Math.min(8, f - 4) : null });
        await audit(req, "login.fail", { email });
      }
      return fail();
    }
    await db("users").where({ id: u.id }).update({ failed_logins: 0, locked_until: null });
    req.session.regenerate(err => {
      if (err) return next(err);
      if (u.totp_enabled) { req.session.pending2fa = u.id; req.session.pendingAt = Date.now(); return req.session.save(() => res.redirect("/admin/2fa")); }
      finishLogin(req, res, u, next);
    });
  } catch (e) { next(e); }
});

function finishLogin(req, res, u, next) {
  req.session.regenerate(async err => {
    if (err) return next(err);
    req.session.uid = u.id; req.session.ver = u.session_version; req.session.seen = Date.now();
    await db("users").where({ id: u.id }).update({ last_login_at: Date.now() });
    req.user = u; await audit(req, "login.ok");
    req.session.save(() => res.redirect("/admin"));
  });
}

router.get("/2fa", (req, res) => { if (!req.session.pending2fa) return res.redirect("/admin/login"); res.render("admin/totp", { error: "" }); });
router.post("/2fa", loginLimiter, sec.csrfVerify, async (req, res, next) => {
  try {
    const uid = req.session.pending2fa;
    if (!uid || Date.now() - (req.session.pendingAt || 0) > 5 * 60 * 1000) { delete req.session.pending2fa; return res.redirect("/admin/login?expire=1"); }
    const u = await db("users").where({ id: uid, active: true }).first();
    const code = String(req.body.code || "").replace(/\s/g, "");
    if (!u || await hits("2fa:" + uid, 15 * 60 * 1000) >= 6) return res.status(401).render("admin/totp", { error: "Trop d'essais. Reconnectez-vous dans 15 minutes." });
    let good = false;
    try { good = /^\d{6}$/.test(code) && authenticator.check(code, sec.decrypt(u.totp_secret_enc)); } catch { good = false; }
    // Un même code ne peut servir qu'une fois (anti-rejeu).
    if (good && await hits("2fa-used:" + uid + ":" + code, 90 * 1000) > 0) good = false;
    if (!good) { await hit("2fa:" + uid); await audit({ ip: req.ip, user: u }, "2fa.fail"); return res.status(401).render("admin/totp", { error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." }); }
    await hit("2fa-used:" + uid + ":" + code);
    finishLogin(req, res, u, next);
  } catch (e) { next(e); }
});

router.post("/logout", sec.csrfVerify, async (req, res) => {
  if (req.user) await audit(req, "logout");
  req.session.destroy(() => res.redirect("/admin/login"));
});

router.use(needLogin);

/* ---------- Réservations ---------- */
const NEXT = { pending: ["confirmed", "declined"], confirmed: ["done", "noshow", "pending", "cancelled"], declined: ["pending"], noshow: ["done"], done: [], cancelled: ["pending"] };
const STATUS_FR = { pending: "À traiter", confirmed: "Confirmée", declined: "Refusée", cancelled: "Annulée", done: "Venu", noshow: "Absent" };

router.get("/", async (req, res, next) => {
  try {
    const today = U.today(), s = scope(req);
    const f = { pub: s || U.line(req.query.pub, 32), status: U.line(req.query.status, 12), when: ["today", "upcoming", "past", "all"].includes(req.query.when) ? req.query.when : "upcoming" };
    if (!req.query.status && !req.query.when) f.status = "";
    let q = db("reservations").where({ anonymized: false });
    if (f.pub) q = q.where({ pub_id: f.pub });
    if (f.status) q = q.where({ status: f.status });
    if (f.when === "today") q = q.where({ date: today }); else if (f.when === "upcoming") q = q.where("date", ">=", today); else if (f.when === "past") q = q.where("date", "<", today);
    const rows = await q.orderBy([{ column: "date", order: f.when === "past" ? "desc" : "asc" }, { column: "time", order: "asc" }]).limit(300);
    const base = db("reservations").modify(qb => { if (s) qb.where({ pub_id: s }); });
    const pending = Number((await base.clone().where({ status: "pending" }).andWhere("date", ">=", today).count({ n: "*" }).first()).n);
    const todayRows = await base.clone().where({ date: today }).whereIn("status", ["pending", "confirmed", "done"]);
    const pubs = await db("pubs").orderBy("sort");
    const load = {};
    for (const p of pubs) for (const sv of ["midi", "soir"]) { const cap = booking.capOf(p, sv); if (cap) load[p.id + sv] = { cap, left: await booking.seatsLeft(p, today, sv) }; }
    res.render("admin/reservations", { rows, f, pending, todayCount: todayRows.length, covers: todayRows.reduce((a, r) => a + r.persons, 0), pubs, load, STATUS_FR, NEXT, U, today });
  } catch (e) { next(e); }
});

router.post("/reservations/:id/status", sec.csrfVerify, async (req, res, next) => {
  try {
    const r = await db("reservations").where({ id: +req.params.id }).first();
    const to = String(req.body.status || "");
    if (!r || !canPub(req, r.pub_id)) { flash(req, "err", "Réservation introuvable."); return res.redirect("/admin"); }
    if (!(NEXT[r.status] || []).includes(to)) { flash(req, "err", "Changement de statut impossible."); return res.redirect(req.get("referer") || "/admin"); }
    await db("reservations").where({ id: r.id }).update({ status: to, handled_at: Date.now(), handled_by: req.user.id });
    await audit(req, "resa." + to, { id: r.id, pub: r.pub_id, date: r.date });
    const pub = await db("pubs").where({ id: r.pub_id }).first();
    const t = translator(r.lang), link = SITE + "/" + r.lang + "/reservation/" + r.token;
    const vars = { pub: pub.name, n: r.persons, date: U.fmtDate(r.date, r.lang, false), time: r.time, link, tel: pub.tel || "" };
    let sent = "";
    if (to === "confirmed" || to === "declined") {
      const key = to === "confirmed" ? "Confirmed" : "Declined";
      if (r.email) await N.safe(() => N.sendMail({ to: r.email, subject: t("mail.resa" + key + "Subj", vars),
        html: N.layout({ title: t("mail.resa" + key + "Subj", vars), paragraphs: [t("mail.hello", { name: r.name }), t("mail.resa" + key, { ...vars, date: U.fmtDate(r.date, r.lang, true) }), t("mail.team")], button: { href: link, label: t("mail.follow") }, footer: N.esc(t("mail.why")) }),
        text: t("mail.resa" + key, vars) + "\n" + link }), "mail statut");
      sent = r.email ? (config.MAIL_MODE === "smtp" ? " E-mail envoyé au client." : " (Envoi d'e-mails pas encore activé : prévenez le client au " + r.phone + ".)") : " Pas d'e-mail : appelez le client au " + r.phone + ".";
    }
    flash(req, "ok", r.name + " · " + STATUS_FR[to] + "." + sent);
    res.redirect(req.get("referer") && req.get("referer").includes("/admin") ? req.get("referer") : "/admin");
  } catch (e) { next(e); }
});

// Réservation prise par téléphone.
router.post("/reservations/new", sec.csrfVerify, async (req, res, next) => {
  try {
    const b = req.body, pub = await db("pubs").where({ id: U.line(b.pub, 32) }).first();
    const persons = U.int(b.persons, 1, 200), phone = U.phone(b.phone) || U.line(b.phone, 32), name = U.line(b.name, 120);
    if (!pub || !canPub(req, pub.id) || !U.isDate(b.date) || !U.isTime(b.time) || !persons || !name) { flash(req, "err", "Complétez pub, date, heure, nombre de personnes et nom."); return res.redirect("/admin#nouvelle"); }
    pub.hours = U.json(pub.hours, []);
    if (b.force !== "1") {
      const left = await booking.seatsLeft(pub, b.date, U.serviceOf(b.time));
      if (left !== null && left < persons) { flash(req, "err", "Plus que " + left + " place(s) sur ce service. Cochez « Dépasser la capacité » pour forcer."); return res.redirect("/admin#nouvelle"); }
    }
    const [id] = await db("reservations").insert({ token: sec.token(24), pub_id: pub.id, date: b.date, time: b.time, service: U.serviceOf(b.time), persons, occasion: U.line(b.occasion, 40) || "Téléphone", name, phone: phone || "—", email: U.email(b.email) || "", note: U.text(b.note, 500), lang: b.lang === "en" ? "en" : "fr", status: "confirmed", created_at: Date.now(), handled_at: Date.now(), handled_by: req.user.id });
    await audit(req, "resa.manual", { id, pub: pub.id, date: b.date });
    flash(req, "ok", "Réservation ajoutée : " + name + ", " + persons + " pers., " + U.fmtDate(b.date, "fr") + " à " + b.time + ".");
    res.redirect("/admin?when=upcoming");
  } catch (e) { next(e); }
});

/* ---------- Groupes ---------- */
const GSTATUS = { new: "Nouvelle", sent: "Offre envoyée", won: "Acceptée", lost: "Annulée" };
router.get("/groupes", async (req, res, next) => {
  try {
    const s = scope(req);
    const rows = await db("group_requests").where({ anonymized: false }).modify(q => { if (s) q.where({ pub_id: s }); }).orderBy("created_at", "desc").limit(200);
    res.render("admin/groups", { rows, GSTATUS, U });
  } catch (e) { next(e); }
});
router.post("/groupes/:id/status", sec.csrfVerify, async (req, res, next) => {
  try {
    const g = await db("group_requests").where({ id: +req.params.id }).first(), to = String(req.body.status);
    if (!g || !canPub(req, g.pub_id) || !GSTATUS[to]) { flash(req, "err", "Demande introuvable."); return res.redirect("/admin/groupes"); }
    await db("group_requests").where({ id: g.id }).update({ status: to });
    await audit(req, "group." + to, { id: g.id });
    flash(req, "ok", g.name + " · " + GSTATUS[to] + ".");
    res.redirect("/admin/groupes");
  } catch (e) { next(e); }
});

/* ---------- Fidélité ---------- */
router.get("/fidelite", async (req, res, next) => {
  try {
    const code = U.line(req.query.code, 20).toUpperCase().replace(/^GOUDALE-/, "");
    const card = code ? await db("loyalty_cards").where({ code }).first() : null;
    const events = card ? await db("loyalty_events").where({ card_id: card.id }).orderBy("created_at", "desc").limit(10) : [];
    const st = await db("loyalty_cards").select(db.raw("count(*) as cards"), db.raw("coalesce(sum(total),0) as total"), db.raw("coalesce(sum(gifts),0) as gifts")).first();
    const ready = Number((await db("loyalty_cards").where("stamps", ">=", 10).count({ n: "*" }).first()).n);
    res.render("admin/loyalty", { code, card, events, st, ready, U, searched: !!code });
  } catch (e) { next(e); }
});
router.post("/fidelite/:id/:action", sec.csrfVerify, async (req, res, next) => {
  try {
    const card = await db("loyalty_cards").where({ id: +req.params.id }).first();
    if (!card) { flash(req, "err", "Carte introuvable."); return res.redirect("/admin/fidelite"); }
    const back = "/admin/fidelite?code=" + card.code, a = req.params.action, now = Date.now();
    // Garde-fou : 6 tampons maximum par carte et par jour (évite les erreurs et les abus).
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const dayStamps = Number((await db("loyalty_events").where({ card_id: card.id, kind: "stamp" }).andWhere("created_at", ">=", todayStart.getTime()).sum({ n: "delta" }).first()).n || 0);
    if (a === "stamp") {
      const k = U.int(req.body.n, 1, 3) || 1;
      if (card.stamps >= 10) { flash(req, "err", "La carte est pleine : servez d'abord la bière offerte."); return res.redirect(back); }
      if (dayStamps + k > 6) { flash(req, "err", "Limite de 6 tampons par jour atteinte pour cette carte."); return res.redirect(back); }
      const add = Math.min(k, 10 - card.stamps);
      await db("loyalty_cards").where({ id: card.id }).update({ stamps: card.stamps + add, total: card.total + add, last_at: now });
      await db("loyalty_events").insert({ card_id: card.id, kind: "stamp", delta: add, user_id: req.user.id, pub_id: req.user.pub_id, created_at: now });
      flash(req, "ok", "+" + add + " tampon(s). " + (card.stamps + add >= 10 ? "Carte pleine : la prochaine bière est offerte !" : (10 - card.stamps - add) + " avant la bière offerte."));
    } else if (a === "undo" && card.stamps > 0) {
      await db("loyalty_cards").where({ id: card.id }).update({ stamps: card.stamps - 1, total: Math.max(0, card.total - 1) });
      await db("loyalty_events").insert({ card_id: card.id, kind: "undo", delta: -1, user_id: req.user.id, pub_id: req.user.pub_id, created_at: now });
      flash(req, "ok", "Tampon retiré.");
    } else if (a === "gift" && card.stamps >= 10) {
      await db("loyalty_cards").where({ id: card.id }).update({ stamps: 0, gifts: card.gifts + 1, last_at: now });
      await db("loyalty_events").insert({ card_id: card.id, kind: "gift", delta: -10, user_id: req.user.id, pub_id: req.user.pub_id, created_at: now });
      flash(req, "ok", "Bière offerte enregistrée. La carte repart à zéro.");
    }
    await audit(req, "loyalty." + a, { card: card.code });
    res.redirect(back);
  } catch (e) { next(e); }
});

/* ---------- Épuisé en un clic (gérants compris) ---------- */
router.get("/epuise", async (req, res, next) => {
  try { res.render("admin/soldout", { items: await db("menu_items").orderBy(["kind", "sort", "id"]) }); } catch (e) { next(e); }
});
router.post("/epuise/:id", sec.csrfVerify, async (req, res, next) => {
  try {
    const it = await db("menu_items").where({ id: +req.params.id }).first();
    if (it) { await db("menu_items").where({ id: it.id }).update({ sold_out: !it.sold_out }); content.invalidate(); await audit(req, "menu.soldout", { id: it.id, out: !it.sold_out }); }
    res.redirect("/admin/epuise");
  } catch (e) { next(e); }
});

/* ---------- Mon compte : mot de passe et 2FA ---------- */
router.get("/compte", async (req, res) => {
  let setup = null;
  if (!req.user.totp_enabled) {
    if (!req.session.totpSetup) req.session.totpSetup = sec.encrypt(authenticator.generateSecret(20));
    const secret = sec.decrypt(req.session.totpSetup);
    const uri = authenticator.keyuri(req.user.email, "Pub Goudale", secret);
    setup = { secret: secret.replace(/(.{4})/g, "$1 ").trim(), qr: await QRCode.toString(uri, { type: "svg", margin: 1, width: 200 }) };
  }
  res.render("admin/account", { setup, require2fa: config.require2fa });
});
router.post("/compte/mot-de-passe", sec.csrfVerify, async (req, res, next) => {
  try {
    const { current, next: pw, confirm } = req.body;
    if (!sec.verifyPassword(String(current || ""), req.user.password_hash)) { flash(req, "err", "Mot de passe actuel incorrect."); return res.redirect("/admin/compte"); }
    if (pw !== confirm) { flash(req, "err", "Les deux nouveaux mots de passe ne correspondent pas."); return res.redirect("/admin/compte"); }
    const p = sec.passwordProblem(pw, req.user.email);
    if (p) { flash(req, "err", p); return res.redirect("/admin/compte"); }
    const ver = req.user.session_version + 1;
    await db("users").where({ id: req.user.id }).update({ password_hash: sec.hashPassword(pw), session_version: ver });
    req.session.ver = ver; // les autres sessions ouvertes sont déconnectées
    await audit(req, "user.password");
    flash(req, "ok", "Mot de passe modifié. Vos autres sessions ont été déconnectées.");
    res.redirect("/admin/compte");
  } catch (e) { next(e); }
});
router.post("/compte/2fa", sec.csrfVerify, async (req, res, next) => {
  try {
    if (req.user.totp_enabled || !req.session.totpSetup) return res.redirect("/admin/compte");
    const secret = sec.decrypt(req.session.totpSetup), code = String(req.body.code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code) || !authenticator.check(code, secret)) { flash(req, "err", "Code incorrect. Saisissez le code à 6 chiffres affiché par l'application."); return res.redirect("/admin/compte"); }
    await db("users").where({ id: req.user.id }).update({ totp_secret_enc: sec.encrypt(secret), totp_enabled: true });
    delete req.session.totpSetup;
    await audit(req, "user.2fa.on");
    flash(req, "ok", "Double authentification activée. Elle sera demandée à chaque connexion.");
    res.redirect("/admin");
  } catch (e) { next(e); }
});
router.post("/compte/2fa/desactiver", sec.csrfVerify, async (req, res, next) => {
  try {
    if (config.require2fa) { flash(req, "err", "La double authentification est obligatoire sur ce site."); return res.redirect("/admin/compte"); }
    if (!sec.verifyPassword(String(req.body.password || ""), req.user.password_hash)) { flash(req, "err", "Mot de passe incorrect."); return res.redirect("/admin/compte"); }
    await db("users").where({ id: req.user.id }).update({ totp_enabled: false, totp_secret_enc: null });
    await audit(req, "user.2fa.off");
    flash(req, "ok", "Double authentification désactivée.");
    res.redirect("/admin/compte");
  } catch (e) { next(e); }
});

/* ======================================================================
   À partir d'ici : réservé au propriétaire (contenu, réglages, comptes).
   ====================================================================== */
router.use(ownerOnly);

/* ---------- Contenu : éditeur générique de listes ---------- */
const LISTS = {
  carte: { table: "menu_items", title: "Carte", order: ["kind", "sort", "id"], fields: [
    { k: "kind", l: "Type", type: "select", options: [["beer", "Bière"], ["food", "Cuisine"]] },
    { k: "name", l: "Nom", req: true, max: 120 }, { k: "name_en", l: "Nom (EN)", max: 120 },
    { k: "descr", l: "Description", max: 240 }, { k: "descr_en", l: "Description (EN)", max: 240 },
    { k: "price", l: "Prix (CHF)", max: 40 }, { k: "tag", l: "Étiquette", max: 40 }, { k: "tag_en", l: "Étiquette (EN)", max: 40 },
    { k: "sold_out", l: "Épuisé", type: "check" }, { k: "sort", l: "Ordre", type: "int" }] },
  matchs: { table: "matches", title: "Matchs de la semaine", order: ["day", "time", "sort"], help: "Le match apparaît sur « Ce soir au pub » le jour indiqué.", fields: [
    { k: "day", l: "Jour", type: "select", options: FR("days").map((d, i) => [String(i), d]) },
    { k: "time", l: "Heure", type: "time" }, { k: "title", l: "Compétition", req: true, max: 120 }, { k: "sub", l: "Affiche", max: 160 },
    { k: "pub_id", l: "Pub", type: "pub" }] },
  formules: { table: "formules", title: "Formules groupes", order: ["sort", "id"], help: "Le prix par personne sert à l'estimation affichée aux clients.", fields: [
    { k: "label", l: "Nom", req: true, max: 80 }, { k: "label_en", l: "Nom (EN)", max: 80 },
    { k: "descr", l: "Contenu", max: 240 }, { k: "descr_en", l: "Contenu (EN)", max: 240 },
    { k: "price_pp", l: "Prix / pers. (CHF)", type: "int" }, { k: "sort", l: "Ordre", type: "int" }] }
};
function readRow(def, body, pubs) {
  const row = {};
  for (const f of def.fields) {
    const v = body[f.k];
    if (f.type === "check") row[f.k] = v === "1";
    else if (f.type === "int") row[f.k] = U.int(v, 0, 100000) ?? 0;
    else if (f.type === "select") { const ok = f.options.find(o => o[0] === String(v)); row[f.k] = ok ? (f.k === "day" ? +ok[0] : ok[0]) : (f.k === "day" ? 0 : f.options[0][0]); }
    else if (f.type === "pub") row[f.k] = pubs.some(p => p.id === v) ? v : null;
    else if (f.type === "time") row[f.k] = U.isTime(v) ? v : "";
    else row[f.k] = U.line(v, f.max || 200);
    if (f.req && !row[f.k]) return { error: "Le champ « " + f.l + " » est obligatoire." };
  }
  return { row };
}
router.get("/contenu/:list", async (req, res, next) => {
  try {
    const def = LISTS[req.params.list]; if (!def) return next();
    res.render("admin/list", { def, key: req.params.list, rows: await db(def.table).orderBy(def.order), pubs: await db("pubs").orderBy("sort") });
  } catch (e) { next(e); }
});
router.post("/contenu/:list/:id", sec.csrfVerify, async (req, res, next) => {
  try {
    const def = LISTS[req.params.list]; if (!def) return next();
    const back = "/admin/contenu/" + req.params.list;
    if (req.body._action === "delete") {
      await db(def.table).where({ id: +req.params.id }).del();
      await audit(req, "content.delete", { list: req.params.list, id: +req.params.id });
      flash(req, "ok", "Ligne supprimée.");
    } else {
      const { row, error } = readRow(def, req.body, await db("pubs"));
      if (error) { flash(req, "err", error); return res.redirect(back); }
      if (req.params.id === "new") await db(def.table).insert(row); else await db(def.table).where({ id: +req.params.id }).update(row);
      await audit(req, "content.save", { list: req.params.list, id: req.params.id });
      flash(req, "ok", "Enregistré. Le site est à jour.");
    }
    content.invalidate();
    res.redirect(back);
  } catch (e) { next(e); }
});

/* ---------- Menu de la semaine ---------- */
router.get("/semaine", async (req, res, next) => {
  try { const c = await content.load(); res.render("admin/week", { week: c.week, days: FR("days") }); } catch (e) { next(e); }
});
router.post("/semaine", sec.csrfVerify, async (req, res, next) => {
  try {
    for (let d = 0; d < 5; d++) {
      const row = { name: U.line(req.body["name" + d], 120), name_en: U.line(req.body["name_en" + d], 120), descr: U.line(req.body["descr" + d], 240), descr_en: U.line(req.body["descr_en" + d], 240), price: U.line(req.body["price" + d], 40) };
      const n = await db("week_menu").where({ day: d }).update(row);
      if (!n) await db("week_menu").insert({ day: d, ...row });
    }
    content.invalidate(); await audit(req, "week.save");
    flash(req, "ok", "Menu de la semaine enregistré.");
    res.redirect("/admin/semaine");
  } catch (e) { next(e); }
});

/* ---------- Pubs, horaires et capacité ---------- */
router.get("/pubs/:id", async (req, res, next) => {
  try {
    const pub = await db("pubs").where({ id: req.params.id }).first(); if (!pub) return next();
    pub.hours = U.json(pub.hours, ["", "", "", "", "", "", ""]);
    res.render("admin/pub", { pub, days: FR("days") });
  } catch (e) { next(e); }
});
router.post("/pubs/:id", sec.csrfVerify, async (req, res, next) => {
  try {
    const pub = await db("pubs").where({ id: req.params.id }).first(); if (!pub) return next();
    const b = req.body, back = "/admin/pubs/" + pub.id;
    const maps = U.httpsUrl(b.maps_url), review = U.httpsUrl(b.review_url);
    if (maps === null || review === null) { flash(req, "err", "Les liens doivent commencer par https://"); return res.redirect(back); }
    const email = b.email ? U.email(b.email) : "";
    if (b.email && !email) { flash(req, "err", "Adresse e-mail du pub invalide."); return res.redirect(back); }
    if (b.open_date && !U.isDate(b.open_date)) { flash(req, "err", "Date d'ouverture invalide."); return res.redirect(back); }
    const cap = v => (v === "" || v == null ? null : U.int(v, 0, 2000));
    await db("pubs").where({ id: pub.id }).update({
      name: U.line(b.name, 80) || pub.name, area: U.line(b.area, 120), status: b.status === "soon" ? "soon" : "open",
      addr: U.text(b.addr, 300), tel: U.line(b.tel, 32), email, services: U.line(b.services, 200), services_en: U.line(b.services_en, 200),
      maps_url: maps, review_url: review, company: U.line(b.company, 120), company_ide: U.line(b.company_ide, 40), cap_midi: cap(b.cap_midi), cap_soir: cap(b.cap_soir), open_date: b.open_date || null,
      hours: JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(i => U.line(b["h" + i], 40)))
    });
    content.invalidate(); await audit(req, "pub.save", { id: pub.id });
    flash(req, "ok", "Pub " + (U.line(b.name, 80) || pub.name) + " enregistré.");
    res.redirect(back);
  } catch (e) { next(e); }
});

/* ---------- Réglages : annonce, société, automatisations ---------- */
const SETTINGS = ["annonce_fr", "annonce_en", "company_name", "company_address", "company_ide", "contact_email", "sms_provider_note", "privacy_updated"];
router.get("/reglages", async (req, res, next) => {
  try { res.render("admin/settings", { s: await content.settingsMap(), smsMode: config.SMS_MODE, mailMode: config.MAIL_MODE }); } catch (e) { next(e); }
});
router.post("/reglages", sec.csrfVerify, async (req, res, next) => {
  try {
    if (req.body.contact_email && !U.email(req.body.contact_email)) { flash(req, "err", "E-mail de contact invalide."); return res.redirect("/admin/reglages"); }
    for (const k of SETTINGS) await content.setSetting(k, k === "contact_email" ? (U.email(req.body[k]) || "") : U.line(req.body[k], k === "company_address" ? 240 : 200));
    for (const k of ["annonce_active", "monday_auto", "reminders"]) await content.setSetting(k, req.body[k] === "1" ? "1" : "0");
    await audit(req, "settings.save");
    flash(req, "ok", "Réglages enregistrés.");
    res.redirect("/admin/reglages");
  } catch (e) { next(e); }
});

/* ---------- Newsletter ---------- */
router.get("/newsletter", async (req, res, next) => {
  try {
    const subs = await db("subscribers").orderBy("created_at", "desc");
    const c = await content.load();
    res.render("admin/newsletter", { subs, pubs: c.pubs, U, auto: c.settings.monday_auto === "1", last: c.settings.monday_last || "" });
  } catch (e) { next(e); }
});
router.get("/newsletter/apercu", async (req, res, next) => {
  try {
    const c = await content.load(), lang = req.query.lang === "en" ? "en" : "fr";
    const m = newsletter.build(c, lang, SITE + "/" + lang + "/newsletter/desinscription/apercu");
    // Aperçu de l'e-mail : styles en ligne autorisés pour cette seule page, aucun script.
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'").type("html").send(m.html);
  } catch (e) { next(e); }
});
router.post("/newsletter/envoyer", sec.csrfVerify, async (req, res, next) => {
  try {
    if (req.body.mode === "test") {
      const r = await newsletter.sendWeekly({ email: req.user.email, lang: "fr", token: "test" });
      flash(req, r.sent ? "ok" : "err", r.sent ? "E-mail de test envoyé à " + req.user.email + "." : "L'envoi de test a échoué : vérifiez les réglages SMTP.");
    } else {
      if (req.body.confirm !== "ENVOYER") { flash(req, "err", "Tapez ENVOYER pour confirmer l'envoi à tous les inscrits."); return res.redirect("/admin/newsletter"); }
      const r = await newsletter.sendWeekly();
      await content.setSetting("monday_last", U.mondayOf());
      await audit(req, "newsletter.send", r);
      flash(req, r.failed ? "warn" : "ok", r.sent + " e-mail(s) envoyé(s)" + (r.failed ? ", " + r.failed + " échec(s) : vérifiez le journal du serveur." : "."));
    }
    res.redirect("/admin/newsletter");
  } catch (e) { next(e); }
});
function csv(rows) { return "﻿" + rows.map(r => r.map(v => '"' + String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1") + '"').join(";")).join("\r\n"); }
router.get("/newsletter.csv", async (req, res, next) => {
  try {
    const subs = await db("subscribers").where({ status: "confirmed" }).orderBy("created_at");
    await audit(req, "export.newsletter", { n: subs.length });
    res.attachment("newsletter-goudale-" + U.today() + ".csv").type("text/csv; charset=utf-8")
      .send(csv([["email", "langue", "pubs", "inscription"], ...subs.map(s => [s.email, s.lang, U.json(s.pubs, []).join(", "), U.isoDate(new Date(+s.created_at))])]));
  } catch (e) { next(e); }
});

/* ---------- Ouverture Concorde ---------- */
router.get("/ouverture", async (req, res, next) => {
  try { res.render("admin/opening", { rows: await db("opening_signups").orderBy("created_at", "desc"), U }); } catch (e) { next(e); }
});
router.get("/ouverture.csv", async (req, res, next) => {
  try {
    const rows = await db("opening_signups").orderBy("created_at");
    await audit(req, "export.opening", { n: rows.length });
    res.attachment("ouverture-concorde-" + U.today() + ".csv").type("text/csv; charset=utf-8").send(csv([["nom", "personnes", "email", "langue"], ...rows.map(r => [r.name, r.persons, r.email, r.lang])]));
  } catch (e) { next(e); }
});

/* ---------- Photos ---------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.mimetype)) });
router.get("/photos", async (req, res, next) => {
  try { res.render("admin/photos", { photos: await db("photos").select("id", "slot", "file", "width", "height", "alt", "alt_en").orderBy(["slot", "sort", "id"]), pubs: await db("pubs").orderBy("sort") }); } catch (e) { next(e); }
});
router.post("/photos", (req, res, next) => upload.single("photo")(req, res, err => {
  if (err) { flash(req, "err", err.code === "LIMIT_FILE_SIZE" ? "Photo trop lourde (10 Mo maximum)." : "Envoi impossible."); return res.redirect("/admin/photos"); }
  next();
}), sec.csrfVerify, async (req, res, next) => {
  try {
    if (!req.file) { flash(req, "err", "Choisissez une photo JPEG, PNG, WebP ou HEIC."); return res.redirect("/admin/photos"); }
    const pubs = await db("pubs");
    const slot = req.body.slot === "hero" || req.body.slot === "gallery" || pubs.some(p => "pub:" + p.id === req.body.slot) ? req.body.slot : null;
    if (!slot) { flash(req, "err", "Emplacement inconnu."); return res.redirect("/admin/photos"); }
    // On relit l'image avec sharp (rejette tout fichier qui n'est pas une vraie image) et on la réencode
    // en WebP sans métadonnées (supprime la position GPS et les infos de l'appareil).
    let meta;
    try { meta = await sharp(req.file.buffer, { limitInputPixels: 60e6 }).metadata(); } catch { meta = null; }
    if (!meta || !meta.width) { flash(req, "err", "Ce fichier n'est pas une image valide."); return res.redirect("/admin/photos"); }
    const name = sec.token(12), imgs = {};
    let out = null;
    for (const w of [800, 1600]) {
      const r = await sharp(req.file.buffer, { limitInputPixels: 60e6 }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      imgs[w] = r.data; if (w === 1600) out = r.info;
    }
    if (slot !== "gallery") await db("photos").where({ slot }).del();
    await db("photos").insert({ slot, file: name, width: out.width, height: out.height, alt: U.line(req.body.alt, 200), alt_en: U.line(req.body.alt_en, 200), sort: 0, created_at: Date.now(), img800: imgs[800], img1600: imgs[1600] });
    content.invalidate(); await audit(req, "photo.add", { slot });
    flash(req, "ok", "Photo ajoutée.");
    res.redirect("/admin/photos");
  } catch (e) { next(e); }
});
router.post("/photos/:id/supprimer", sec.csrfVerify, async (req, res, next) => {
  try {
    const p = await db("photos").where({ id: +req.params.id }).first();
    if (p) {
      for (const w of [800, 1600]) await fs.rm(path.join(path.resolve(config.UPLOAD_DIR), p.file + "-" + w + ".webp"), { force: true }).catch(() => {});
      await db("photos").where({ id: p.id }).del(); content.invalidate(); await audit(req, "photo.delete", { id: p.id });
      flash(req, "ok", "Photo supprimée.");
    }
    res.redirect("/admin/photos");
  } catch (e) { next(e); }
});

/* ---------- QR codes ---------- */
const QR_TARGETS = { carte: ["Carte (tables)", "/fr#carte"], "ce-soir": ["Ce soir au pub", "/fr/ce-soir"], reserver: ["Réserver", "/fr#reserver"], fidelite: ["Carte fidélité", "/fr#fidelite"], groupes: ["Groupes", "/fr#groupes"], concorde: ["Ouverture Concorde", "/fr/concorde"], avis: ["Avis Google (par pub)", null] };
router.get("/qr", async (req, res, next) => {
  try {
    const pubs = await db("pubs").orderBy("sort");
    res.render("admin/qr", { targets: QR_TARGETS, pubs, site: SITE });
  } catch (e) { next(e); }
});
router.get("/qr/:target.:ext(svg|png)", async (req, res, next) => {
  try {
    let url;
    if (req.params.target.startsWith("avis-")) {
      const p = await db("pubs").where({ id: req.params.target.slice(5) }).first();
      if (!p || !p.review_url) return next();
      url = p.review_url;
    } else { const t = QR_TARGETS[req.params.target]; if (!t || !t[1]) return next(); url = SITE + t[1]; }
    const name = "qr-goudale-" + req.params.target + "." + req.params.ext;
    if (req.query.dl) res.attachment(name);
    if (req.params.ext === "svg") return res.type("image/svg+xml").send(await QRCode.toString(url, { type: "svg", margin: 2, width: 512, errorCorrectionLevel: "M" }));
    res.type("png").send(await QRCode.toBuffer(url, { margin: 2, width: 1024, errorCorrectionLevel: "M" }));
  } catch (e) { next(e); }
});

/* ---------- Comptes ---------- */
router.get("/utilisateurs", async (req, res, next) => {
  try { res.render("admin/users", { users: await db("users").orderBy("created_at"), pubs: await db("pubs").orderBy("sort"), U, created: req.session.newPassword || null }); delete req.session.newPassword; } catch (e) { next(e); }
});
function tempPassword() { return sec.token(12).replace(/[-_]/g, "x"); }
router.post("/utilisateurs", sec.csrfVerify, async (req, res, next) => {
  try {
    const email = U.email(req.body.email), name = U.line(req.body.name, 120);
    const role = req.body.role === "owner" ? "owner" : "manager";
    const pub = role === "manager" ? await db("pubs").where({ id: U.line(req.body.pub_id, 32) }).first() : null;
    if (!email || !name || (role === "manager" && !pub)) { flash(req, "err", "Indiquez un e-mail, un nom et, pour un gérant, son pub."); return res.redirect("/admin/utilisateurs"); }
    if (await db("users").where({ email }).first()) { flash(req, "err", "Un compte existe déjà avec cet e-mail."); return res.redirect("/admin/utilisateurs"); }
    const pw = tempPassword();
    await db("users").insert({ email, name, role, pub_id: pub ? pub.id : null, password_hash: sec.hashPassword(pw), created_at: Date.now() });
    await audit(req, "user.create", { email, role });
    req.session.newPassword = { email, pw };
    res.redirect("/admin/utilisateurs");
  } catch (e) { next(e); }
});
router.post("/utilisateurs/:id/:action", sec.csrfVerify, async (req, res, next) => {
  try {
    const u = await db("users").where({ id: +req.params.id }).first(), a = req.params.action;
    if (!u) return res.redirect("/admin/utilisateurs");
    if (u.id === req.user.id && a !== "reset") { flash(req, "err", "Vous ne pouvez pas modifier votre propre compte ici : utilisez « Mon compte »."); return res.redirect("/admin/utilisateurs"); }
    if (a === "toggle") {
      await db("users").where({ id: u.id }).update({ active: !u.active, session_version: u.session_version + 1 });
      flash(req, "ok", u.name + (u.active ? " désactivé : ses sessions sont fermées." : " réactivé."));
    } else if (a === "reset") {
      if (u.id === req.user.id) { flash(req, "err", "Changez votre mot de passe depuis « Mon compte »."); return res.redirect("/admin/utilisateurs"); }
      const pw = tempPassword();
      await db("users").where({ id: u.id }).update({ password_hash: sec.hashPassword(pw), session_version: u.session_version + 1, failed_logins: 0, locked_until: null });
      req.session.newPassword = { email: u.email, pw };
    } else if (a === "reset2fa") {
      await db("users").where({ id: u.id }).update({ totp_enabled: false, totp_secret_enc: null, session_version: u.session_version + 1 });
      flash(req, "ok", "2FA de " + u.name + " réinitialisée : il devra la reconfigurer à la prochaine connexion.");
    }
    await audit(req, "user." + a, { id: u.id, email: u.email });
    res.redirect("/admin/utilisateurs");
  } catch (e) { next(e); }
});

/* ---------- Journal ---------- */
router.get("/journal", async (req, res, next) => {
  try {
    const rows = await db("audit_log").leftJoin("users", "users.id", "audit_log.user_id").select("audit_log.*", "users.name as user_name").orderBy("audit_log.created_at", "desc").limit(300);
    res.render("admin/journal", { rows, U });
  } catch (e) { next(e); }
});

module.exports = router;
