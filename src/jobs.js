"use strict";
// Tâches planifiées (heure de Genève) : rappels SMS, e-mail du lundi, purge des données (nLPD).
const cron = require("node-cron");
const db = require("./db");
const config = require("./config");
const content = require("./lib/content");
const { translator } = require("./i18n");
const N = require("./lib/notify");
const U = require("./lib/util");
const newsletter = require("./lib/newsletter");

const SITE = config.SITE_URL.replace(/\/$/, "");

// Rappel SMS la veille, pour les réservations confirmées.
async function reminders() {
  const c = await content.load();
  if (c.settings.reminders === "0" || config.SMS_MODE === "off") return 0;
  const tomorrow = U.addDays(U.today(), 1);
  const rows = await db("reservations").where({ date: tomorrow, status: "confirmed", reminded: false });
  for (const r of rows) {
    const t = translator(r.lang), pub = c.pubs.find(p => p.id === r.pub_id) || { name: "" };
    await N.safe(() => N.sendSms(r.phone, t("mail.smsReminder", { pub: pub.name, n: r.persons, time: r.time, link: SITE + "/" + r.lang + "/reservation/" + r.token })), "rappel SMS");
    await db("reservations").where({ id: r.id }).update({ reminded: true });
  }
  return rows.length;
}

// E-mail du lundi automatique (une seule fois par semaine, si activé dans les réglages).
async function monday() {
  const c = await content.load();
  if (c.settings.monday_auto !== "1") return null;
  const week = U.mondayOf();
  if (c.settings.monday_last === week) return null;
  await content.setSetting("monday_last", week);
  const r = await newsletter.sendWeekly();
  console.log("[lundi] newsletter envoyée : %d ok, %d échecs", r.sent, r.failed);
  return r;
}

// Purge et anonymisation : on ne garde pas les données personnelles plus longtemps que nécessaire.
async function purge() {
  const cutoffDate = U.addDays(U.today(), -Math.round(config.RETENTION_MONTHS * 30.4));
  const cutoffMs = Date.now() - config.RETENTION_MONTHS * 30.4 * 864e5;
  const anon = { name: "—", phone: "—", email: "", note: "", anonymized: true };
  const a = await db("reservations").where("date", "<", cutoffDate).andWhere({ anonymized: false }).update(anon);
  const g = await db("group_requests").where("created_at", "<", cutoffMs).andWhere({ anonymized: false }).update({ name: "—", phone: "", email: "", note: "", anonymized: true });
  const s = await db("subscribers").where({ status: "pending" }).andWhere("created_at", "<", Date.now() - 30 * 864e5).del();
  const l = await db("loyalty_cards").where(q => q.where("last_at", "<", Date.now() - 730 * 864e5).orWhere(q2 => q2.whereNull("last_at").andWhere("created_at", "<", Date.now() - 730 * 864e5))).del();
  await db("rate_events").where("created_at", "<", Date.now() - 2 * 864e5).del();
  await db("audit_log").where("created_at", "<", Date.now() - 24 * 30.4 * 864e5).del();
  const concorde = await db("pubs").where({ id: "concorde" }).first();
  if (concorde && concorde.open_date && concorde.open_date < U.addDays(U.today(), -90)) await db("opening_signups").del();
  return { reservations: a, groups: g, pendingSubs: s, cards: l };
}

function start() {
  const opts = { timezone: config.TZ };
  cron.schedule("0 10 * * *", () => reminders().catch(e => console.error("[rappels]", e)), opts);
  cron.schedule("0 8 * * 1", () => monday().catch(e => console.error("[lundi]", e)), opts);
  cron.schedule("30 3 * * *", () => purge().then(r => console.log("[purge]", JSON.stringify(r))).catch(e => console.error("[purge]", e)), opts);
  console.log("Tâches planifiées actives (rappels 10:00, lundi 08:00, purge 03:30).");
}

module.exports = { start, reminders, monday, purge };
