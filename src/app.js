"use strict";
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const config = require("./config");
const { csrfIssue } = require("./lib/security");
const { translator } = require("./i18n");
const pkg = require("../package.json");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Une seule adresse officielle : www.domaine ↔ domaine redirige vers l'adresse de SITE_URL (meilleur pour Google).
  const SITE_HOST = new URL(config.SITE_URL).hostname;
  const ALT_HOST = SITE_HOST.startsWith("www.") ? SITE_HOST.slice(4) : "www." + SITE_HOST;
  app.set("trust proxy", /^\d+$/.test(config.TRUST_PROXY) ? +config.TRUST_PROXY : config.TRUST_PROXY);
  app.use((req, res, next) => {
    if (config.isProd && config.secure) {
      const xfp = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
      if (xfp === "http") return res.redirect(req.method === "GET" || req.method === "HEAD" ? 301 : 308, config.SITE_URL.replace(/\/$/, "") + req.originalUrl);
      // Le site n'est joignable qu'à travers le proxy HTTPS de l'hébergeur : sans indication, on considère la connexion sécurisée
      // (nécessaire pour que les cookies « Secure » de session soient bien envoyés).
      if (!xfp) req.headers["x-forwarded-proto"] = "https";
    }
    next();
  });
  app.use((req, res, next) => {
    if (config.isProd && req.hostname === ALT_HOST && (req.method === "GET" || req.method === "HEAD")) return res.redirect(301, config.SITE_URL.replace(/\/$/, "") + req.originalUrl);
    next();
  });
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  if (config.isProd) app.set("view cache", true);

  /* ---------- En-têtes de sécurité ---------- */
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"], connectSrc: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
        baseUri: ["'none'"], objectSrc: ["'none'"], manifestSrc: ["'self'"],
        ...(config.secure ? { upgradeInsecureRequests: [] } : {})
      }
    },
    hsts: config.secure ? { maxAge: 63072000, includeSubDomains: false, preload: false } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" }
  }));
  app.use((req, res, next) => { res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"); next(); });

  /* ---------- Fichiers statiques ---------- */
  app.use("/static", express.static(path.join(__dirname, "..", "public"), { maxAge: config.isProd ? "30d" : 0, immutable: config.isProd, index: false, dotfiles: "deny" }));
  // Photos : stockées dans la base de données (elles survivent aux mises à jour), anciens fichiers en secours.
  const db = require("./db");
  const legacy = express.static(path.resolve(config.UPLOAD_DIR), { maxAge: "30d", immutable: true, index: false, dotfiles: "deny", fallthrough: false });
  app.get("/media/:name", async (req, res, next) => {
    try {
      const m = /^([A-Za-z0-9_-]{8,32})-(800|1600)\.webp$/.exec(req.params.name);
      if (!m) return next();
      const col = m[2] === "800" ? "img800" : "img1600";
      const row = await db("photos").where({ file: m[1] }).select(col).first();
      if (row && row[col]) return res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=2592000, immutable", "X-Content-Type-Options": "nosniff" }).send(Buffer.from(row[col]));
      legacy(req, res, next);
    } catch (e) { next(e); }
  });

  app.use(express.urlencoded({ extended: false, limit: "32kb", parameterLimit: 200 }));

  /* ---------- Variables communes aux gabarits ---------- */
  app.locals.v = pkg.version;
  app.locals.siteUrl = config.SITE_URL.replace(/\/$/, "");
  app.use((req, res, next) => {
    res.locals.path = req.path;
    res.locals.lang = "fr";
    res.locals.t = translator("fr");
    next();
  });

  // Les routes du gérant ont leurs propres sessions ; le CSRF est émis après la session.
  app.use("/admin", require("./routes/admin"));

  app.use(csrfIssue);
  app.use(require("./routes/public"));

  /* ---------- Erreurs ---------- */
  app.use((req, res) => {
    res.status(404).render("pages/error", { title: res.locals.t("errors.notFound"), text: res.locals.t("errors.notFoundText"), code: 404 });
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const t = res.locals.t || translator("fr");
    if (err.expose === "csrf") return res.status(403).render("pages/error", { title: t("errors.title"), text: t("errors.csrf"), code: 403 });
    if (err.type === "entity.too.large" || err.status === 413) return res.status(413).render("pages/error", { title: t("errors.title"), text: "Envoi trop volumineux.", code: 413 });
    if (err.status === 404) return res.status(404).render("pages/error", { title: t("errors.notFound"), text: t("errors.notFoundText"), code: 404 });
    console.error("[erreur]", req.method, req.originalUrl, err);
    res.status(500).render("pages/error", { title: t("errors.server"), text: t("errors.serverText"), code: 500 });
  });
  return app;
}

module.exports = { createApp };
