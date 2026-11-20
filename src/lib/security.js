"use strict";
const crypto = require("crypto");
const config = require("../config");

const SECRET = Buffer.from(config.APP_SECRET, "utf8");
const derive = label => crypto.createHmac("sha256", SECRET).update("goudale:" + label).digest();
const CSRF_KEY = derive("csrf");
const FORM_KEY = derive("form-timing");
const ENC_KEY = derive("encryption"); // 32 octets → AES-256-GCM

/* ---------- Jetons aléatoires ---------- */
function token(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }
function code(len = 6) {
  // Sans O/0/I/1 pour éviter les confusions au comptoir.
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  while (s.length < len) {
    const b = crypto.randomBytes(1)[0];
    if (b < 256 - (256 % a.length)) s += a[b % a.length]; // pas de biais modulo
  }
  return s;
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- Mots de passe (scrypt, sans dépendance native) ---------- */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw).normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}
// Haché factice : on calcule toujours un scrypt, même pour un e-mail inconnu, pour ne pas révéler les comptes existants par le temps de réponse.
const DUMMY_HASH = hashPassword(token(16));
function verifyPassword(pw, stored) {
  const parts = String(stored || DUMMY_HASH).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(String(pw).normalize("NFKC"), Buffer.from(salt, "base64"), expected.length,
    { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(got, expected) && !!stored;
}
const COMMON = ["motdepasse", "password", "123456789", "goudale", "azerty", "qwerty", "admin", "geneve", "blackstore"];
function passwordProblem(pw, email) {
  const s = String(pw || "");
  if (s.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (s.length > 200) return "Le mot de passe est trop long (200 caractères maximum).";
  const low = s.toLowerCase();
  if (COMMON.some(w => low.includes(w))) return "Le mot de passe contient un mot trop courant (goudale, password, 123456…). Choisissez une phrase personnelle.";
  const local = String(email || "").split("@")[0].toLowerCase();
  if (local.length >= 3 && low.includes(local)) return "Le mot de passe ne doit pas contenir votre adresse e-mail.";
  if (new Set(s).size < 6) return "Le mot de passe est trop répétitif.";
  return null;
}

/* ---------- Chiffrement des secrets 2FA ---------- */
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const data = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
function decrypt(blob) {
  const [iv, tag, data] = String(blob).split(".");
  const d = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/* ---------- CSRF : double soumission signée + contrôle d'origine ---------- */
const CSRF_COOKIE = config.secure ? "__Host-gd_csrf" : "gd_csrf";
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignoré */ } }
  });
  return out;
}
function csrfTokenFor(cookieVal, sid) {
  return crypto.createHmac("sha256", CSRF_KEY).update(cookieVal + "|" + (sid || "")).digest("base64url");
}
function csrfIssue(req, res, next) {
  let v = parseCookies(req.headers.cookie)[CSRF_COOKIE];
  if (!v || !/^[A-Za-z0-9_-]{43}$/.test(v)) {
    v = token(32);
    res.cookie(CSRF_COOKIE, v, { httpOnly: true, sameSite: "strict", secure: config.secure, path: "/" });
  }
  req.csrfCookie = v;
  res.locals.csrfToken = csrfTokenFor(v, req.session && req.session.uid ? req.sessionID : "");
  next();
}
// Le site est accepté avec et sans « www. » (les deux adresses mènent au même site).
const SITE = new URL(config.SITE_URL);
const BARE = SITE.hostname.replace(/^www\./, "");
const SITE_ORIGINS = [SITE.protocol + "//" + BARE, SITE.protocol + "//www." + BARE].map(o => o + (SITE.port ? ":" + SITE.port : ""));
const okOrigin = o => SITE_ORIGINS.includes(o) || (!config.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
function requestOrigins(req) {
  const hosts = [req.get("x-forwarded-host"), req.get("host")].filter(Boolean).map(h => String(h).split(",")[0].trim());
  return hosts.flatMap(h => ["https://" + h, "http://" + h]);
}
function originOf(req) {
  const o = req.get("origin");
  if (o) return o;
  const r = req.get("referer");
  if (r) { try { return new URL(r).origin; } catch { return "invalid"; } }
  return "";
}
function sameOrigin(req) {
  const o = originOf(req);
  if (o) return okOrigin(o) || requestOrigins(req).includes(o);
  return !config.isProd; // en production, un POST sans Origin ni Referer est refusé
}
function csrfVerify(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.get("x-csrf-token") || "";
  const cookie = req.csrfCookie || parseCookies(req.headers.cookie)[CSRF_COOKIE] || "";
  const expected = cookie ? csrfTokenFor(cookie, req.session && req.session.uid ? req.sessionID : "") : "";
  if (!sameOrigin(req) || !cookie || !safeEqual(sent, expected)) {
    if (!config.isTest) console.warn("[sécurité] formulaire refusé sur %s : origine %s (site %s), cookie %s, jeton %s", req.originalUrl,
      originOf(req) || "absente", SITE_ORIGINS[0], cookie ? "présent" : "ABSENT (page ouverte en http ?)", !sent ? "absent" : (cookie && safeEqual(sent, expected) ? "valide" : "invalide"));
    const e = new Error("csrf"); e.status = 403; e.expose = "csrf"; return next(e);
  }
  next();
}

/* ---------- Anti-robots : champ piège + délai minimal de saisie ---------- */
function formStamp() {
  const t = Date.now().toString(36);
  return t + "." + crypto.createHmac("sha256", FORM_KEY).update(t).digest("base64url").slice(0, 22);
}
function isBot(body) {
  if (body && String(body.website || "").length) return true; // champ invisible rempli par un robot
  const [t, sig] = String((body && body.ts) || "").split(".");
  if (!t || !sig) return true;
  const exp = crypto.createHmac("sha256", FORM_KEY).update(t).digest("base64url").slice(0, 22);
  if (!safeEqual(sig, exp)) return true;
  const age = Date.now() - parseInt(t, 36);
  return config.isTest ? age < 0 : (age < 2500 || age > 6 * 3600 * 1000);
}

module.exports = { token, code, safeEqual, hashPassword, verifyPassword, passwordProblem, encrypt, decrypt,
  csrfIssue, csrfVerify, parseCookies, formStamp, isBot, CSRF_COOKIE };
