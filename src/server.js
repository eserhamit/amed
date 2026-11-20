"use strict";
const config = require("./config");
const db = require("./db");
const { createApp } = require("./app");

async function main() {
  try { await db.migrate.latest(); }
  catch (e) {
    // Un démarrage interrompu peut laisser le verrou des migrations posé : on le libère et on réessaie une fois.
    if (!/already locked/i.test(e.message)) throw e;
    await db.migrate.forceFreeMigrationsLock();
    await db.migrate.latest();
  }
  await require("./bootstrap")();
  const app = createApp();
  const server = app.listen(config.PORT, () => console.log("Pub Goudale en ligne sur le port %d (%s)", config.PORT, config.NODE_ENV));
  server.headersTimeout = 20000; server.requestTimeout = 30000;
  if (config.jobsEnabled) require("./jobs").start();
  const stop = () => { server.close(() => db.destroy().then(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
main().catch(e => { console.error("Démarrage impossible :", e); process.exit(1); });
