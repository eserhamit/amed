"use strict";
// Envoi des e-mails (SMTP Infomaniak) et des SMS (Twilio). En mode « log », rien ne part :
// les messages sont affichés dans la console et gardés en mémoire (utile pour les tests).
const nodemailer = require("nodemailer");
const config = require("../config");
const { line } = require("./util");

const outbox = []; // derniers messages en mode log
const keep = m => { outbox.push(m); if (outbox.length > 200) outbox.shift(); };

let transport = null;
function mailer() {
  if (!transport && config.MAIL_MODE === "smtp") {
    transport = nodemailer.createTransport({
      host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.smtpSecure,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
      requireTLS: !config.smtpSecure, tls: { minVersion: "TLSv1.2" },
      disableFileAccess: true, disableUrlAccess: true
    });
  }
  return transport;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Gabarit d'e-mail transactionnel, compatible avec les clients mail (tableaux + styles en ligne).
function layout({ title, paragraphs = [], button, footer, preheader }) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + esc(title) + '</title></head>' +
    '<body style="margin:0;background:#F6F4EE;font-family:Arial,Helvetica,sans-serif;color:#16261F">' +
    (preheader ? '<div style="display:none;max-height:0;overflow:hidden">' + esc(preheader) + '</div>' : "") +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EE"><tr><td align="center" style="padding:24px 12px">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:#1F3A2E;color:#F6F1E2;padding:22px 26px"><div style="font-size:12px;letter-spacing:2px;color:#E2A23B;font-weight:bold">PUB GOUDALE GENÈVE</div>' +
    '<div style="font-size:24px;font-weight:bold;line-height:1.2;margin-top:6px">' + esc(title) + '</div></td></tr>' +
    '<tr><td style="padding:22px 26px;font-size:15px;line-height:1.55">' + paragraphs.map(p => '<p style="margin:0 0 14px">' + esc(p) + '</p>').join("") +
    (button ? '<p style="margin:20px 0 4px"><a href="' + esc(button.href) + '" style="display:inline-block;background:#C47F12;color:#1B1206;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">' + esc(button.label) + '</a></p>' : "") +
    '</td></tr><tr><td style="padding:16px 26px;background:#F3E4C4;font-size:12px;color:#3A2E17">' + (footer || "") + '</td></tr></table></td></tr></table></body></html>';
}

async function sendMail({ to, subject, html, text, headers }) {
  const msg = { from: config.MAIL_FROM, to, subject: line(subject, 200), html, text, headers };
  if (config.MAIL_MODE === "log") {
    keep({ type: "mail", to, subject: msg.subject, text, html });
    if (!config.isTest) console.log("[mail] → %s · %s", to, msg.subject);
    return { logged: true };
  }
  return mailer().sendMail(msg);
}

async function sendSms(to, body) {
  const text = line(body, 320);
  if (config.SMS_MODE === "off" || !to) return { skipped: true };
  if (config.SMS_MODE === "log") {
    keep({ type: "sms", to, body: text });
    if (!config.isTest) console.log("[sms] → %s · %s", to, text);
    return { logged: true };
  }
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(config.TWILIO_ACCOUNT_SID) + "/Messages.json";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(config.TWILIO_ACCOUNT_SID + ":" + config.TWILIO_AUTH_TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: config.TWILIO_FROM, Body: text }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error("SMS refusé par le fournisseur (" + res.status + ")");
  return { sent: true };
}

// Les envois ne doivent jamais faire échouer l'action principale : on journalise l'erreur et on continue.
async function safe(fn, label) {
  try { return await fn(); } catch (e) { console.error("[notify] échec %s : %s", label, e.message); return { error: e.message }; }
}

module.exports = { layout, sendMail, sendSms, safe, outbox, esc };
