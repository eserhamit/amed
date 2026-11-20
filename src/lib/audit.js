"use strict";
const db = require("../db");
const { line } = require("./util");

async function audit(req, action, details) {
  try {
    await db("audit_log").insert({
      user_id: req && req.user ? req.user.id : null,
      action: line(action, 60),
      details: details == null ? "" : line(typeof details === "string" ? details : JSON.stringify(details), 1000),
      ip: req ? line(req.ip, 64) : "",
      created_at: Date.now()
    });
  } catch (e) { console.error("[audit]", e.message); }
}

// Compteur persistant pour limiter les tentatives (ex. connexion) : count(bucket, fenêtre) et hit(bucket).
async function hits(bucket, windowMs) {
  const r = await db("rate_events").where("bucket", bucket).andWhere("created_at", ">", Date.now() - windowMs).count({ n: "*" }).first();
  return Number(r ? r.n : 0);
}
async function hit(bucket) { await db("rate_events").insert({ bucket: line(bucket, 120), created_at: Date.now() }); }

module.exports = { audit, hits, hit };
