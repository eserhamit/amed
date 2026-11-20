"use strict";
// Réservations : contrôle de capacité dans une transaction verrouillée (pas de surréservation,
// même si deux clients réservent la dernière table à la même seconde).
const db = require("../db");
const config = require("../config");
const { parseRange } = require("./hours");
const { serviceOf, dayIdxOf } = require("./util");

const ACTIVE = ["pending", "confirmed", "done", "noshow"];
const isMysql = config.DB_CLIENT === "mysql2";

function capOf(pub, service) {
  const v = service === "midi" ? pub.cap_midi : pub.cap_soir;
  return v > 0 ? v : 0;
}

async function used(trx, pubId, date, service) {
  const r = await (trx || db)("reservations").where({ pub_id: pubId, date, service }).whereIn("status", ACTIVE).sum({ n: "persons" }).first();
  return Number((r && r.n) || 0);
}

async function seatsLeft(pub, date, service) {
  const cap = capOf(pub, service);
  if (!cap) return null;
  return Math.max(0, cap - (await used(null, pub.id, date, service)));
}

// L'heure demandée doit tomber dans les horaires du jour, au plus tard 1 h avant la fermeture.
function withinHours(pub, date, time) {
  const hours = Array.isArray(pub.hours) ? pub.hours : [];
  const h = String(hours[dayIdxOf(date)] || "");
  if (!h) return true; // horaires pas encore saisis pour ce jour : on laisse le pub décider
  if (/ferm|closed/i.test(h)) return false;
  const r = parseRange(h);
  if (!r) return true;
  const [hh, mm] = time.split(":").map(Number);
  let m = hh * 60 + mm;
  if (m < r[0] && r[1] > 1440) m += 1440;
  return m >= r[0] && m <= r[1] - 60;
}

class FullError extends Error { constructor(left) { super("full"); this.left = left; } }

async function create(pub, data) {
  const service = serviceOf(data.time);
  return db.transaction(async trx => {
    const q = trx("pubs").where({ id: pub.id });
    const locked = await (isMysql ? q.forUpdate() : q).first();
    if (!locked) throw new Error("pub");
    const cap = capOf(locked, service);
    if (cap) {
      const u = await used(trx, pub.id, data.date, service);
      if (u + data.persons > cap) throw new FullError(Math.max(0, cap - u));
    }
    const row = { ...data, pub_id: pub.id, service, status: "pending", created_at: Date.now() };
    const [id] = await trx("reservations").insert(row);
    return { ...row, id: typeof id === "object" ? id.id : id };
  });
}

module.exports = { ACTIVE, capOf, seatsLeft, withinHours, create, FullError };
