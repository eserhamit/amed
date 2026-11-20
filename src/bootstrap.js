"use strict";
// Premier démarrage sans ligne de commande (hébergement Infomaniak) :
// installe le contenu d'exemple s'il n'y en a pas, et crée le compte propriétaire
// à partir de ADMIN_EMAIL / ADMIN_PASSWORD si aucun compte n'existe encore.
const config = require("./config");
const db = require("./db");
const sec = require("./lib/security");
const U = require("./lib/util");
const seed = require("../scripts/seed");

async function bootstrap() {
  await seed();
  const users = Number((await db("users").count({ n: "*" }).first()).n);
  const email = U.email(config.ADMIN_EMAIL || "");
  if (users === 0) {
    if (!email || !config.ADMIN_PASSWORD) {
      console.warn("Aucun compte gérant : renseignez ADMIN_EMAIL et ADMIN_PASSWORD dans le fichier .env, puis redémarrez.");
      return;
    }
    const problem = sec.passwordProblem(config.ADMIN_PASSWORD, email);
    if (problem) { console.error("ADMIN_PASSWORD refusé : " + problem + " Corrigez le fichier .env puis redémarrez."); return; }
    await db("users").insert({ email, name: U.line(config.ADMIN_NAME || "Propriétaire", 120), role: "owner", password_hash: sec.hashPassword(config.ADMIN_PASSWORD), created_at: Date.now() });
    console.log("Compte propriétaire créé pour " + email + ". Retirez maintenant ADMIN_PASSWORD du fichier .env puis redémarrez.");
  } else if (config.ADMIN_PASSWORD) {
    console.warn("Sécurité : ADMIN_PASSWORD est encore présent dans le fichier .env. Effacez cette ligne puis redémarrez.");
  }
}
module.exports = bootstrap;
