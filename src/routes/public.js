"use strict";
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const QRCode = require("qrcode");
const db = require("../db");
const config = require("../config");
const { translator, pickLang, LANGS } = require("../i18n");
const content = require("../lib/content");
const { tr } = content;
const { openStatus, openingSpec } = require("../lib/hours");
const booking = require("../lib/booking");
const sec = require("../lib/security");
const U = require("../lib/util");
const N = require("../lib/notify");

const router = express.Router();
const SITE = config.SITE_URL.replace(/\/$/, "");

/* ---------- Limites anti-abus ---------- */
const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: config.isTest ? 1000 : 8, standardHeaders: "draft-7", legacyHeaders: false,
  handler: (req, res) => res.status(429).render("pages/error", { title: res.locals.t("errors.title"), text: res.locals.t("errors.rate"), code: 429 })
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: config.isTest ? 1000 : 120, standardHeaders: "draft-7", legacyHeaders: false });

/* ---------- Langue ---------- */
function withLang(req, res, next) {
  const lang = req.params.lang;
  if (!LANGS.includes(lang)) return next("route");
  res.locals.lang = lang;
  res.locals.t = translator(lang);
  res.locals.otherUrl = "/" + (lang === "fr" ? "en" : "fr") + req.path.replace(/^\/(fr|en)/, "");
  next();
}

async function baseLocals(req, res, extra = {}) {
  const c = await content.load();
  const t = res.locals.t, lang = res.locals.lang;
  const ti = U.dayIdx();
  const statuses = {};
  c.pubs.forEach(p => { statuses[p.id] = openStatus(p, t); });
  const annonce = c.settings.annonce_active === "1" ? (lang === "en" && c.settings.annonce_en ? c.settings.annonce_en : c.settings.annonce_fr) : "";
  return {
    c, tr: (o, f) => tr(o, f, lang), statuses, ti, annonce, U, esc: N.esc,
    canonical: SITE + req.path, alternates: LANGS.map(l => ({ lang: l, href: SITE + req.path.replace(/^\/(fr|en)/, "/" + l) })),
    flash: req.query.ok ? flashText(t, String(req.query.ok)) : "",
    stamp: sec.formStamp(), errors: [], values: { pub: U.line(req.query.pub, 32) }, errorForm: "",
    ...extra
  };
}
function flashText(t, k) {
  const allowed = ["resaSent", "groupSent", "newsPending", "newsConfirmed", "newsUnsub", "loyaltySent", "openingSent", "resaCancelled"];
  return allowed.includes(k) ? t("flash." + k) : "";
}

function jsonLd(c, lang) {
  const org = {
    "@context": "https://schema.org", "@graph": c.pubs.filter(p => p.status !== "soon").map(p => ({
      "@type": "BarOrPub", "@id": SITE + "/#" + p.id, name: "Pub Goudale " + p.name, url: SITE + "/" + lang,
      telephone: p.tel || undefined, servesCuisine: ["Burgers", "Pub food"], acceptsReservations: "True", priceRange: "CHF",
      address: p.addr ? { "@type": "PostalAddress", streetAddress: String(p.addr).split("\n")[0], addressLocality: "Genève", addressCountry: "CH" } : undefined,
      openingHoursSpecification: openingSpec(p.hours),
      image: c.photo("pub:" + p.id) ? SITE + "/media/" + c.photo("pub:" + p.id).file + "-1600.webp" : undefined
    }))
  };
  return JSON.stringify(org).replace(/</g, "\\u003c");
}

/* ---------- Accueil et pages ---------- */
router.get("/", (req, res) => { res.set("Vary", "Accept-Language"); res.redirect(302, "/" + pickLang(req)); });

router.get("/:lang", withLang, async (req, res, next) => {
  try { const L = await baseLocals(req, res); res.render("pages/home", { ...L, jsonld: jsonLd(L.c, res.locals.lang) }); } catch (e) { next(e); }
});

router.get("/:lang/ce-soir", withLang, async (req, res, next) => {
  try {
    const L = await baseLocals(req, res);
    const today = U.today(), seats = {};
    for (const p of L.c.openPubs) seats[p.id] = await booking.seatsLeft(p, today, "soir");
    res.set("Cache-Control", "no-store");
    res.render("pages/tonight", { ...L, seats, todayMatches: content.matchesToday(L.c) });
  } catch (e) { next(e); }
});

router.get("/:lang/concorde", withLang, async (req, res, next) => {
  try { const L = await baseLocals(req, res); res.render("pages/concorde", { ...L, pub: L.c.pubs.find(p => p.id === "concorde") }); } catch (e) { next(e); }
});

router.get("/:lang/ecran", withLang, async (req, res, next) => {
  try { const L = await baseLocals(req, res); res.render("pages/screen", { ...L, pubId: U.line(req.query.pub, 32) }); } catch (e) { next(e); }
});

router.get("/:lang/mentions-legales", withLang, async (req, res, next) => {
  try { res.render("legal/mentions", await baseLocals(req, res)); } catch (e) { next(e); }
});
router.get("/:lang/confidentialite", withLang, async (req, res, next) => {
  try { res.render("legal/privacy", await baseLocals(req, res)); } catch (e) { next(e); }
});

/* ---------- Réservation ---------- */
router.post("/:lang/reserver", withLang, formLimiter, sec.csrfVerify, async (req, res, next) => {
  const t = res.locals.t, lang = res.locals.lang, b = req.body;
  try {
    const c = await content.load();
    const values = { pub: U.line(b.pub, 32), date: U.line(b.date, 10), time: U.line(b.time, 5), persons: U.line(b.persons, 3), occasion: U.line(b.occasion, 40), name: U.line(b.name, 120), phone: U.line(b.phone, 32), email: U.line(b.email, 160), note: U.text(b.note, 500) };
    const errors = [];
    if (sec.isBot(b)) errors.push(t("errors.bot"));
    const pub = c.openPubs.find(p => p.id === values.pub);
    if (!pub) errors.push(t("errors.pub"));
    const today = U.today();
    if (!U.isDate(values.date) || values.date < today || values.date > U.addDays(today, 183)) errors.push(t("errors.date"));
    if (!U.isTime(values.time)) errors.push(t("errors.time"));
    else if (pub && U.isDate(values.date) && !booking.withinHours(pub, values.date, values.time)) errors.push(t("errors.closed"));
    const persons = U.int(values.persons, 1, 15);
    if (!persons) errors.push(t("errors.persons"));
    if (!values.name) errors.push(t("errors.name"));
    const phone = U.phone(values.phone);
    if (!phone) errors.push(t("errors.phone"));
    const email = U.email(values.email);
    if (!email) errors.push(t("errors.email"));
    const occasions = t("resa.occasions");
    const occasion = occasions.includes(values.occasion) ? values.occasion : occasions[0];

    let r = null;
    if (!errors.length) {
      try {
        r = await booking.create(pub, { token: sec.token(24), date: values.date, time: values.time, persons, occasion, name: values.name, phone, email, note: values.note, lang });
      } catch (e) {
        if (e instanceof booking.FullError) errors.push(e.left > 0 ? t("errors.full", { n: e.left, pub: pub.name }) : t("errors.fullNone", { pub: pub.name }));
        else throw e;
      }
    }
    if (errors.length) {
      const L = await baseLocals(req, res, { errors, values, errorForm: "resa" });
      return res.status(422).render("pages/home", { ...L, jsonld: jsonLd(L.c, lang) });
    }
    const link = SITE + "/" + lang + "/reservation/" + r.token;
    const dateTxt = U.fmtDate(r.date, lang, true);
    if (email) N.safe(() => N.sendMail({ to: email, subject: t("mail.resaReceivedSubj", { pub: pub.name }),
      html: N.layout({ title: t("mail.resaReceivedSubj", { pub: pub.name }), paragraphs: [t("mail.hello", { name: r.name }), t("mail.resaReceived", { n: persons, date: dateTxt, time: r.time, pub: pub.name }), t("mail.team")], button: { href: link, label: t("mail.follow") }, footer: N.esc(t("mail.why")) }),
      text: t("mail.resaReceived", { n: persons, date: dateTxt, time: r.time, pub: pub.name }) + "\n" + link }), "mail résa client");
    const notifyTo = pub.email || c.settings.contact_email;
    if (notifyTo) N.safe(() => N.sendMail({ to: notifyTo, subject: "Nouvelle réservation · " + pub.name + " · " + U.fmtDate(r.date, "fr") + " " + r.time + " · " + persons + " pers.",
      html: N.layout({ title: "Nouvelle demande de réservation", paragraphs: [pub.name + " · " + U.fmtDate(r.date, "fr", true) + " à " + r.time, persons + " personne(s) · " + occasion, r.name + " · " + phone + (email ? " · " + email : ""), values.note ? "« " + values.note + " »" : ""].filter(Boolean), button: { href: SITE + "/admin", label: "Ouvrir l'espace gérant" } }),
      text: "Nouvelle réservation " + pub.name + " " + r.date + " " + r.time + " " + persons + " pers. — " + SITE + "/admin" }), "mail résa pub");
    res.redirect(303, "/" + lang + "/reservation/" + r.token + "?ok=resaSent");
  } catch (e) { next(e); }
});

router.get("/:lang/reservation/:token", withLang, async (req, res, next) => {
  try {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return next();
    const r = await db("reservations").where({ token }).first();
    if (!r || r.anonymized) return next();
    const L = await baseLocals(req, res);
    res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex");
    res.render("pages/reservation", { ...L, r, pub: L.c.pubs.find(p => p.id === r.pub_id) || {}, canCancel: ["pending", "confirmed"].includes(r.status) && r.date >= U.today() });
  } catch (e) { next(e); }
});

router.post("/:lang/reservation/:token/annuler", withLang, formLimiter, sec.csrfVerify, async (req, res, next) => {
  try {
    const token = String(req.params.token);
    const r = /^[A-Za-z0-9_-]{20,64}$/.test(token) && await db("reservations").where({ token }).first();
    if (!r) return next();
    if (["pending", "confirmed"].includes(r.status) && r.date >= U.today()) {
      await db("reservations").where({ id: r.id }).update({ status: "cancelled", handled_at: Date.now() });
      const pub = await db("pubs").where({ id: r.pub_id }).first();
      const c = await content.load();
      const to = (pub && pub.email) || c.settings.contact_email;
      if (to) N.safe(() => N.sendMail({ to, subject: "Annulation client · " + (pub ? pub.name : "") + " · " + r.date + " " + r.time + " · " + r.persons + " pers.", text: r.name + " a annulé sa réservation du " + r.date + " à " + r.time + ".", html: N.layout({ title: "Réservation annulée par le client", paragraphs: [r.name + " · " + r.persons + " pers.", U.fmtDate(r.date, "fr", true) + " à " + r.time] }) }), "mail annulation");
    }
    res.redirect(303, "/" + res.locals.lang + "/reservation/" + r.token + "?ok=resaCancelled");
  } catch (e) { next(e); }
});

/* ---------- Groupes ---------- */
router.post("/:lang/groupes", withLang, formLimiter, sec.csrfVerify, async (req, res, next) => {
  const t = res.locals.t, lang = res.locals.lang, b = req.body;
  try {
    const c = await content.load();
    const values = { pub: U.line(b.pub, 32), date: U.line(b.date, 10), persons: U.line(b.persons, 4), budget: U.line(b.budget, 7), formule: U.line(b.formule, 10), name: U.line(b.name, 120), phone: U.line(b.phone, 32), email: U.line(b.email, 160), note: U.text(b.note, 1000) };
    const errors = [];
    if (sec.isBot(b)) errors.push(t("errors.bot"));
    const pub = c.openPubs.find(p => p.id === values.pub);
    if (!pub) errors.push(t("errors.pub"));
    if (values.date && (!U.isDate(values.date) || values.date < U.today() || values.date > U.addDays(U.today(), 400))) errors.push(t("errors.date"));
    const persons = U.int(values.persons, 8, 200);
    if (!persons) errors.push(t("errors.groupPersons"));
    if (!values.name) errors.push(t("errors.name"));
    const phone = values.phone ? U.phone(values.phone) : "";
    if (values.phone && !phone) errors.push(t("errors.phone"));
    const email = values.email ? U.email(values.email) : "";
    if (values.email && !email) errors.push(t("errors.email"));
    if (!phone && !email && !errors.includes(t("errors.phone")) && !errors.includes(t("errors.email"))) errors.push(t("errors.contact"));
    if (errors.length) {
      const L = await baseLocals(req, res, { errors, values, errorForm: "group" });
      return res.status(422).render("pages/home", { ...L, jsonld: jsonLd(L.c, lang) });
    }
    const fo = c.formules.find(f => String(f.id) === values.formule);
    const budget = U.int(values.budget, 0, 1000000);
    await db("group_requests").insert({ pub_id: pub.id, date: values.date || null, persons, budget: budget || null, formule: fo ? fo.label : "Sur mesure", estimate: fo && fo.price_pp > 0 ? fo.price_pp * persons : null, name: values.name, phone, email, note: values.note, lang, status: "new", created_at: Date.now() });
    if (email) N.safe(() => N.sendMail({ to: email, subject: t("mail.groupSubj", { pub: pub.name }), html: N.layout({ title: t("mail.groupSubj", { pub: pub.name }), paragraphs: [t("mail.hello", { name: values.name }), t("mail.group", { pub: pub.name, n: persons }), t("mail.team")], footer: N.esc(t("mail.why")) }), text: t("mail.group", { pub: pub.name, n: persons }) }), "mail groupe client");
    const to = pub.email || c.settings.contact_email;
    if (to) N.safe(() => N.sendMail({ to, subject: "Demande de groupe · " + pub.name + " · " + persons + " pers.", text: values.name + " " + persons + " pers. " + (values.date || "date libre") + " — " + SITE + "/admin/groupes", html: N.layout({ title: "Nouvelle demande de groupe", paragraphs: [pub.name + " · " + persons + " personnes · " + (values.date ? U.fmtDate(values.date, "fr", true) : "date libre"), (fo ? fo.label : "Sur mesure") + (fo && fo.price_pp ? " · estimation " + U.chf(fo.price_pp * persons) + " CHF" : "") + (budget ? " · budget " + U.chf(budget) + " CHF" : ""), values.name + " · " + [phone, email].filter(Boolean).join(" · "), values.note ? "« " + values.note + " »" : ""].filter(Boolean), button: { href: SITE + "/admin/groupes", label: "Voir la demande" } }) }), "mail groupe pub");
    res.redirect(303, "/" + lang + "?ok=groupSent#groupes");
  } catch (e) { next(e); }
});

/* ---------- Newsletter (double confirmation) ---------- */
router.post("/:lang/newsletter", withLang, formLimiter, sec.csrfVerify, async (req, res, next) => {
  const t = res.locals.t, lang = res.locals.lang, b = req.body;
  try {
    const c = await content.load();
    const errors = [];
    if (sec.isBot(b)) errors.push(t("errors.bot"));
    const email = U.email(b.email);
    if (!email) errors.push(t("errors.email"));
    const pubsSel = [].concat(b.pubs || []).map(x => U.line(x, 32)).filter(x => c.pubs.some(p => p.id === x));
    if (!pubsSel.length) errors.push(t("errors.pubs"));
    if (errors.length) {
      const L = await baseLocals(req, res, { errors, values: { email: U.line(b.email, 160), pubs: pubsSel }, errorForm: "news" });
      return res.status(422).render("pages/home", { ...L, jsonld: jsonLd(L.c, lang) });
    }
    const existing = await db("subscribers").where({ email }).first();
    let tok = existing ? existing.token : sec.token(24);
    if (!existing) await db("subscribers").insert({ email, lang, pubs: JSON.stringify(pubsSel), status: "pending", token: tok, created_at: Date.now() });
    else await db("subscribers").where({ id: existing.id }).update({ pubs: JSON.stringify(pubsSel), lang });
    if (!existing || existing.status !== "confirmed") {
      const link = SITE + "/" + lang + "/newsletter/confirmer/" + tok;
      N.safe(() => N.sendMail({ to: email, subject: t("mail.newsConfirmSubj"), html: N.layout({ title: t("mail.newsConfirmSubj"), paragraphs: [t("mail.newsConfirm")], button: { href: link, label: t("mail.newsConfirmBtn") }, footer: N.esc(t("mail.why")) }), text: t("mail.newsConfirm") + "\n" + link }), "mail confirmation newsletter");
    }
    // Même réponse que l'adresse soit nouvelle ou déjà inscrite (on ne révèle pas qui est abonné).
    res.redirect(303, "/" + lang + "?ok=newsPending#newsletter");
  } catch (e) { next(e); }
});

router.get("/:lang/newsletter/confirmer/:token", withLang, async (req, res, next) => {
  try {
    const s = /^[A-Za-z0-9_-]{20,64}$/.test(req.params.token) && await db("subscribers").where({ token: req.params.token }).first();
    if (!s) return next();
    if (s.status !== "confirmed") await db("subscribers").where({ id: s.id }).update({ status: "confirmed", confirmed_at: Date.now() });
    res.redirect(303, "/" + res.locals.lang + "?ok=newsConfirmed#newsletter");
  } catch (e) { next(e); }
});

// Désinscription : la page GET affiche un bouton ; le POST est accepté sans jeton CSRF (désinscription en un clic
// depuis les messageries, RFC 8058), le jeton secret de l'URL suffit à prouver la demande.
router.get("/:lang/newsletter/desinscription/:token", withLang, async (req, res, next) => {
  try {
    const s = /^[A-Za-z0-9_-]{20,64}$/.test(req.params.token) && await db("subscribers").where({ token: req.params.token }).first();
    const L = await baseLocals(req, res);
    res.set("X-Robots-Tag", "noindex").render("pages/unsubscribe", { ...L, token: req.params.token, found: !!s });
  } catch (e) { next(e); }
});
router.post("/:lang/newsletter/desinscription/:token", withLang, async (req, res, next) => {
  try {
    if (/^[A-Za-z0-9_-]{20,64}$/.test(req.params.token)) await db("subscribers").where({ token: req.params.token }).del();
    if (req.body && req.body["List-Unsubscribe"] === "One-Click") return res.status(200).type("text/plain").send("OK");
    res.redirect(303, "/" + res.locals.lang + "?ok=newsUnsub#newsletter");
  } catch (e) { next(e); }
});

/* ---------- Fidélité ---------- */
router.post("/:lang/fidelite", withLang, formLimiter, sec.csrfVerify, async (req, res, next) => {
  const t = res.locals.t, lang = res.locals.lang, b = req.body;
  try {
    const email = U.email(b.email);
    if (sec.isBot(b) || !email) {
      const L = await baseLocals(req, res, { errors: [sec.isBot(b) ? t("errors.bot") : t("errors.email")], values: { loyaltyEmail: U.line(b.email, 160) }, errorForm: "loyalty" });
      return res.status(422).render("pages/home", { ...L, jsonld: jsonLd(L.c, lang) });
    }
    let card = await db("loyalty_cards").where({ email }).first();
    if (!card) {
      for (let i = 0; i < 5 && !card; i++) {
        try { await db("loyalty_cards").insert({ code: sec.code(6), email, token: sec.token(24), lang, stamps: 0, total: 0, gifts: 0, created_at: Date.now() }); card = await db("loyalty_cards").where({ email }).first(); }
        catch (e) { if (!/unique|duplicate/i.test(e.message)) throw e; card = await db("loyalty_cards").where({ email }).first(); }
      }
    }
    if (card) {
      const link = SITE + "/" + lang + "/fidelite/" + card.token;
      N.safe(() => N.sendMail({ to: email, subject: t("mail.loyaltySubj"), html: N.layout({ title: t("mail.loyaltySubj"), paragraphs: [t("mail.loyalty"), t("loyalty.myCode") + " : " + card.code], button: { href: link, label: t("mail.loyaltyBtn") }, footer: N.esc(t("mail.why")) }), text: t("mail.loyalty") + "\n" + card.code + "\n" + link }), "mail fidélité");
    }
    res.redirect(303, "/" + lang + "?ok=loyaltySent#fidelite");
  } catch (e) { next(e); }
});

router.get("/:lang/fidelite/:token", withLang, async (req, res, next) => {
  try {
    const card = /^[A-Za-z0-9_-]{20,64}$/.test(req.params.token) && await db("loyalty_cards").where({ token: req.params.token }).first();
    if (!card) return next();
    const L = await baseLocals(req, res);
    const qr = await QRCode.toString("GOUDALE-" + card.code, { type: "svg", margin: 1, width: 180, color: { dark: "#16261F", light: "#FFFFFF" } });
    res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex");
    res.render("pages/loyalty", { ...L, card, qr });
  } catch (e) { next(e); }
});

/* ---------- Ouverture Concorde ---------- */
router.post("/:lang/concorde", withLang, formLimiter, sec.csrfVerify, async (req, res, next) => {
  const t = res.locals.t, lang = res.locals.lang, b = req.body;
  try {
    const values = { name: U.line(b.name, 120), persons: U.line(b.persons, 2), email: U.line(b.email, 160) };
    const errors = [];
    if (sec.isBot(b)) errors.push(t("errors.bot"));
    if (!values.name) errors.push(t("errors.name"));
    const persons = U.int(values.persons, 1, 10);
    if (!persons) errors.push(t("errors.persons"));
    const email = U.email(values.email);
    if (!email) errors.push(t("errors.email"));
    if (errors.length) {
      const L = await baseLocals(req, res, { errors, values });
      return res.status(422).render("pages/concorde", { ...L, pub: L.c.pubs.find(p => p.id === "concorde") });
    }
    const ex = await db("opening_signups").where({ email }).first();
    if (ex) await db("opening_signups").where({ id: ex.id }).update({ name: values.name, persons, lang });
    else await db("opening_signups").insert({ name: values.name, persons, email, lang, created_at: Date.now() });
    N.safe(() => N.sendMail({ to: email, subject: t("mail.openingSubj"), html: N.layout({ title: t("mail.openingSubj"), paragraphs: [t("mail.opening", { name: values.name, n: persons }), t("mail.team")], footer: N.esc(t("mail.why")) }), text: t("mail.opening", { name: values.name, n: persons }) }), "mail ouverture");
    res.redirect(303, "/" + lang + "/concorde?ok=openingSent");
  } catch (e) { next(e); }
});

/* ---------- API publique (aucune donnée personnelle) ---------- */
router.get("/api/disponibilite", apiLimiter, async (req, res, next) => {
  try {
    const c = await content.load();
    const pub = c.openPubs.find(p => p.id === String(req.query.pub || ""));
    const date = String(req.query.date || ""), time = String(req.query.time || "");
    if (!pub || !U.isDate(date) || !U.isTime(time)) return res.status(400).json({ error: "bad_request" });
    const left = await booking.seatsLeft(pub, date, U.serviceOf(time));
    res.set("Cache-Control", "no-store").json({ left, open: booking.withinHours(pub, date, time) });
  } catch (e) { next(e); }
});

router.get("/api/ecran", apiLimiter, async (req, res, next) => {
  try {
    const c = await content.load();
    const lang = req.query.lang === "en" ? "en" : "fr";
    const pubId = String(req.query.pub || "");
    const t = translator(lang), ti = U.dayIdx(), w = c.week[ti] || null;
    const pick = (o, f) => tr(o, f, lang);
    const pub = c.pubs.find(p => p.id === pubId);
    const slides = [];
    const ann = c.settings.annonce_active === "1" ? (lang === "en" && c.settings.annonce_en ? c.settings.annonce_en : c.settings.annonce_fr) : "";
    if (ann) slides.push({ k: "Info", title: ann });
    if (ti < 5 && w && w.name) slides.push({ k: t("hero.dish") + " · " + t("days")[ti], title: pick(w, "name"), sub: pick(w, "descr"), price: w.price ? w.price + " CHF" : "" });
    const beers = c.beers.filter(i => !i.sold_out);
    if (beers.length) slides.push({ k: t("carte.beers"), list: beers.slice(0, 7).map(i => [pick(i, "name"), i.price]) });
    const m = c.matches.filter(x => !pub || !x.pub_id || x.pub_id === pub.id);
    if (m.length) slides.push({ k: t("sport.board"), list: m.slice(0, 7).map(x => [t("daysShort")[x.day] + " · " + x.title + (x.sub ? " — " + x.sub : ""), x.time]) });
    const food = c.food.filter(i => !i.sold_out);
    if (food.length) slides.push({ k: t("carte.food"), list: food.slice(0, 7).map(i => [pick(i, "name"), i.price]) });
    slides.push({ k: t("loyalty.eyebrow"), title: t("loyalty.title"), sub: SITE.replace(/^https?:\/\//, "") + "/" + lang + "#fidelite" });
    res.set("Cache-Control", "no-store").json({ pub: pub ? pub.name : "", slides });
  } catch (e) { next(e); }
});

/* ---------- Référencement ---------- */
router.get("/robots.txt", (req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /fr/reservation/\nDisallow: /en/reservation/\nDisallow: /fr/fidelite/\nDisallow: /en/fidelite/\nDisallow: /fr/ecran\nDisallow: /en/ecran\nSitemap: " + SITE + "/sitemap.xml\n");
});
router.get("/sitemap.xml", (req, res) => {
  const pages = ["", "/ce-soir", "/concorde", "/mentions-legales", "/confidentialite"];
  const alt = p => LANGS.map(l => '<xhtml:link rel="alternate" hreflang="' + l + '" href="' + SITE + "/" + l + p + '"/>').join("");
  const urls = pages.flatMap(p => LANGS.map(l => "<url><loc>" + SITE + "/" + l + p + "</loc>" + alt(p) + "</url>")).join("");
  res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' + urls + "</urlset>");
});
router.get("/site.webmanifest", (req, res) => {
  res.type("application/manifest+json").send(JSON.stringify({ name: "Pub Goudale Genève", short_name: "Goudale", start_url: "/", display: "standalone", background_color: "#1F3A2E", theme_color: "#1F3A2E", icons: [{ src: "/static/img/icon.svg", sizes: "any", type: "image/svg+xml" }] }));
});
router.get("/favicon.ico", (req, res) => res.redirect(301, "/static/img/icon.svg"));
router.get("/healthz", async (req, res) => { try { await db.raw("select 1"); res.type("text/plain").send("ok"); } catch { res.status(503).send("db"); } });

module.exports = router;
