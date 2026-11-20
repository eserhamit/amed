"use strict";
// Lecture et validation de la configuration (.env). Le serveur refuse de démarrer
// en production si un réglage de sécurité manque, plutôt que de tourner en mode dégradé.
require("dotenv").config();
const { z } = require("zod");

const env = process.env;
const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY: z.string().default("1"),

  // Secret de 32 octets minimum (64 caractères hexadécimaux) : sessions, CSRF, chiffrement du 2FA.
  APP_SECRET: z.string().min(isProd ? 64 : 16, "APP_SECRET doit faire au moins 64 caractères (openssl rand -hex 32)"),

  DB_CLIENT: z.enum(["mysql2", "better-sqlite3"]).default(isProd ? "mysql2" : "better-sqlite3"),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_FILE: z.string().default("./data/dev.sqlite3"),

  MAIL_MODE: z.enum(["smtp", "log"]).default(isProd ? "smtp" : "log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("Pub Goudale Genève <noreply@localhost>"),

  SMS_MODE: z.enum(["twilio", "log", "off"]).default("log"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  // Création automatique du compte propriétaire au premier démarrage (seulement si aucun compte n'existe).
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_REQUIRE_2FA: z.enum(["true", "false"]).default(isProd ? "true" : "false"),
  JOBS_ENABLED: z.enum(["true", "false"]).default(isTest ? "false" : "true"),
  TZ: z.string().default("Europe/Zurich"),
  UPLOAD_DIR: z.string().default("./uploads"),
  RETENTION_MONTHS: z.coerce.number().int().min(1).max(60).default(12)
});

const parsed = schema.safeParse({ ...env, APP_SECRET: env.APP_SECRET || (isProd ? "" : "dev-secret-change-me-dev-secret") });
if (!parsed.success) {
  console.error("Configuration invalide :\n" + parsed.error.issues.map(i => " - " + i.path.join(".") + " : " + i.message).join("\n"));
  process.exit(1);
}
const c = parsed.data;

if (isProd) {
  const missing = [];
  if (c.DB_CLIENT === "mysql2") ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"].forEach(k => { if (!c[k]) missing.push(k); });
  if (c.MAIL_MODE === "smtp" && ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].some(k => !c[k])) {
    console.warn("E-mails : SMTP_USER ou SMTP_PASSWORD manquant dans .env. Le site démarre en mode test (aucun e-mail envoyé).");
    c.MAIL_MODE = "log";
  }
  if (c.SMS_MODE === "twilio") ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"].forEach(k => { if (!c[k]) missing.push(k); });
  if (!c.SITE_URL.startsWith("https://")) missing.push("SITE_URL (doit commencer par https://)");
  if (missing.length) { console.error("Réglages manquants en production : " + missing.join(", ")); process.exit(1); }
}

process.env.TZ = c.TZ;

module.exports = {
  ...c,
  isProd, isTest,
  secure: c.SITE_URL.startsWith("https://"),
  require2fa: c.ADMIN_REQUIRE_2FA === "true",
  jobsEnabled: c.JOBS_ENABLED === "true",
  smtpSecure: c.SMTP_SECURE === "true"
};
