"use strict";
// Outils communs : dates à l'heure de Genève, validation des saisies, textes.

function pad(n) { return String(n).padStart(2, "0"); }
function isoDate(d = new Date()) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today() { return isoDate(new Date()); }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoDate(d); }
function dayIdx(d = new Date()) { return (d.getDay() + 6) % 7; } // lundi = 0
function dayIdxOf(iso) { return dayIdx(new Date(iso + "T12:00:00")); }
function serviceOf(time) { return String(time || "") < "16:00" ? "midi" : "soir"; }
function mondayOf(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() - dayIdx(x)); return isoDate(x); }

function fmtDate(iso, lang, long) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-CH",
      long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}
function chf(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "'"); }

/* ---------- Nettoyage des saisies ---------- */
// Supprime les caractères de contrôle (dont retours à la ligne pour les champs d'une ligne : empêche l'injection d'en-têtes e-mail).
function line(v, max = 120) { return String(v ?? "").replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function text(v, max = 1000) { return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max); }
function int(v, min, max) { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(new Date(v + "T12:00:00")); }
function isTime(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)); }
function email(v) {
  const s = line(v, 160).toLowerCase();
  return /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/.test(s) && !s.includes("..") ? s : null;
}
// Normalise un numéro suisse ou international au format +41791234567.
function phone(v) {
  let s = String(v ?? "").replace(/[\s().\-\/]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = "+41" + s.slice(1);
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}
function httpsUrl(v) {
  const s = line(v, 500);
  if (!s) return "";
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}
function json(v, fallback) { try { const x = JSON.parse(v); return x ?? fallback; } catch { return fallback; } }

module.exports = { pad, isoDate, today, addDays, dayIdx, dayIdxOf, serviceOf, mondayOf, fmtDate, chf,
  line, text, int, isDate, isTime, email, phone, httpsUrl, json };
