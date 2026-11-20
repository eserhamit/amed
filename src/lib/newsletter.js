"use strict";
// E-mail hebdomadaire « menu du lundi », construit à partir du contenu du site.
const db = require("../db");
const config = require("../config");
const content = require("./content");
const { translator } = require("../i18n");
const N = require("./notify");
const U = require("./util");

const SITE = config.SITE_URL.replace(/\/$/, "");

function build(c, lang, unsubUrl) {
  const t = translator(lang), tr = (o, f) => content.tr(o, f, lang);
  const mon = U.mondayOf(), d = i => U.fmtDate(U.addDays(mon, i), lang, false).replace(/^\w+\.?\s*/, "");
  const subject = lang === "en" ? "Pub Goudale · This week's menu from " + d(0) : "Pub Goudale · Menu de la semaine du " + d(0);
  const e = N.esc, td = 'style="padding:10px 0;border-bottom:1px solid #E4E0D4;vertical-align:top"';
  const beers = c.beers.filter(b => !b.sold_out);
  const html = '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + e(subject) + '</title></head><body style="margin:0;background:#F6F4EE;font-family:Arial,Helvetica,sans-serif;color:#16261F">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EE"><tr><td align="center" style="padding:24px 12px"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:#1F3A2E;color:#F6F1E2;padding:28px"><div style="font-size:12px;letter-spacing:2px;color:#E2A23B;font-weight:bold">PUB GOUDALE GENÈVE</div><div style="font-size:30px;font-weight:bold;line-height:1.1;margin-top:8px">' + e(t("week.title")) + '</div><div style="font-size:14px;opacity:.85;margin-top:6px">' + e(d(0)) + ' – ' + e(d(4)) + ' · ' + e(t("week.eyebrow").split("·")[0].trim()) + '</div></td></tr>' +
    '<tr><td style="padding:8px 28px 4px"><table width="100%" cellpadding="0" cellspacing="0">' + c.week.map((w, i) => '<tr><td ' + td + ' width="96"><b style="color:#B8740C">' + e(t("days")[i]) + '</b></td><td ' + td + '><b>' + e(tr(w, "name") || "—") + '</b><br><span style="color:#56645C;font-size:14px">' + e(tr(w, "descr")) + '</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #E4E0D4;white-space:nowrap;vertical-align:top"><b>' + e(w.price) + '</b></td></tr>').join("") + '</table></td></tr>' +
    (c.matches.length ? '<tr><td style="padding:18px 28px 4px"><div style="font-size:12px;letter-spacing:2px;color:#B8740C;font-weight:bold">' + e(t("sport.board").toUpperCase()) + '</div>' + c.matches.map(m => { const p = c.pubs.find(x => x.id === m.pub_id); return '<div style="padding:8px 0;border-bottom:1px dashed #E4E0D4"><b>' + e(t("daysShort")[m.day]) + ' ' + e(m.time) + '</b> · ' + e(m.title) + (m.sub ? ' — ' + e(m.sub) : '') + (p ? ' (' + e(p.name) + ')' : '') + '</div>'; }).join("") + '</td></tr>' : '') +
    (beers.length ? '<tr><td style="padding:18px 28px 4px"><div style="font-size:12px;letter-spacing:2px;color:#B8740C;font-weight:bold">' + e(t("carte.beers").toUpperCase()) + '</div><div style="padding-top:6px">' + beers.map(b => e(tr(b, "name"))).join(" · ") + '</div></td></tr>' : '') +
    '<tr><td style="padding:24px 28px"><a href="' + SITE + '/' + lang + '#reserver" style="display:inline-block;background:#C47F12;color:#1B1206;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">' + e(t("hero.book")) + '</a></td></tr>' +
    '<tr><td style="padding:18px 28px;background:#F3E4C4;font-size:12px;color:#3A2E17">' + c.openPubs.map(p => '<b>' + e(p.name) + '</b>' + (p.addr ? ' · ' + e(String(p.addr).replace(/\n/g, ", ")) : '') + (p.tel ? ' · ' + e(p.tel) : '')).join("<br>") +
    '<br><br>' + e(c.settings.company_name || "Blackstore Sàrl") + ' · <a href="' + e(unsubUrl) + '" style="color:#3A2E17">' + e(t("mail.unsubscribe")) + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = subject + "\n\n" + c.week.map((w, i) => t("days")[i] + " : " + (tr(w, "name") || "—") + (w.price ? " · " + w.price : "")).join("\n") +
    (c.matches.length ? "\n\n" + c.matches.map(m => "- " + t("daysShort")[m.day] + " " + m.time + " · " + m.title + (m.sub ? " — " + m.sub : "")).join("\n") : "") +
    "\n\n" + t("hero.book") + " : " + SITE + "/" + lang + "#reserver\n" + t("mail.unsubscribe") + " : " + unsubUrl;
  return { subject, html, text };
}

async function sendWeekly(onlyTo) {
  const c = await content.load();
  const subs = onlyTo ? [onlyTo] : await db("subscribers").where({ status: "confirmed" });
  let sent = 0, failed = 0;
  for (const s of subs) {
    const lang = s.lang === "en" ? "en" : "fr";
    const unsub = SITE + "/" + lang + "/newsletter/desinscription/" + s.token;
    const m = build(c, lang, unsub);
    try {
      await N.sendMail({ to: s.email, subject: m.subject, html: m.html, text: m.text,
        headers: { "List-Unsubscribe": "<" + unsub + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      sent++;
    } catch (e) { failed++; console.error("[newsletter] %s : %s", s.email, e.message); }
    if (config.MAIL_MODE === "smtp") await new Promise(r => setTimeout(r, 400)); // on ménage le serveur SMTP
  }
  return { sent, failed };
}

module.exports = { build, sendWeekly };
