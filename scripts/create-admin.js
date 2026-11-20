"use strict";
// Crée (ou réinitialise) le compte propriétaire depuis le terminal du serveur :
//   npm run create-admin -- patron@goudale.ch "Prénom Nom"
const readline = require("readline");
const db = require("../src/db");
const sec = require("../src/lib/security");
const U = require("../src/lib/util");

async function ask(q, hidden) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); else rl.output.write("*"); };
  return new Promise(r => rl.question(q, a => { rl.close(); if (hidden) process.stdout.write("\n"); r(a); }));
}
(async () => {
  await db.migrate.latest();
  const email = U.email(process.argv[2]);
  const name = U.line(process.argv[3] || "Propriétaire", 120);
  if (!email) { console.error("Usage : npm run create-admin -- email@domaine.ch \"Nom\""); process.exit(1); }
  const pw = process.env.ADMIN_PASSWORD || await ask("Mot de passe (12 caractères minimum) : ", true);
  const problem = sec.passwordProblem(pw, email);
  if (problem) { console.error(problem); process.exit(1); }
  const ex = await db("users").where({ email }).first();
  if (ex) await db("users").where({ id: ex.id }).update({ password_hash: sec.hashPassword(pw), role: "owner", active: true, failed_logins: 0, locked_until: null, session_version: ex.session_version + 1 });
  else await db("users").insert({ email, name, role: "owner", password_hash: sec.hashPassword(pw), created_at: Date.now() });
  console.log((ex ? "Compte réinitialisé" : "Compte propriétaire créé") + " : " + email + ". Connectez-vous sur /admin puis activez la double authentification.");
  await db.destroy();
})().catch(e => { console.error(e); process.exit(1); });
