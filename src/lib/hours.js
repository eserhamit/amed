"use strict";
// Statut « ouvert / fermé » calculé à partir des horaires saisis (ex. « 11:30 – 00:00 »), à l'heure de Genève.
const { dayIdx } = require("./util");

function parseRange(t) {
  const m = String(t || "").match(/(\d{1,2})[:h.](\d{2})\s*[–\-—à]+\s*(\d{1,2})[:h.](\d{2})/);
  if (!m) return null;
  const a = +m[1] * 60 + +m[2];
  let b = +m[3] * 60 + +m[4];
  if (b <= a) b += 1440;
  return [a, b];
}
const fmt = m => { m %= 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };

function openStatus(pub, t, now = new Date()) {
  if (pub.status === "soon") return { cls: "soon", label: t("status.soon"), open: false };
  const h = Array.isArray(pub.hours) ? pub.hours : [];
  if (!h.some(Boolean)) return { cls: "todo", label: t("status.hoursSoon"), open: false };
  const mins = now.getHours() * 60 + now.getMinutes(), i = dayIdx(now), y = (i + 6) % 7;
  const ry = parseRange(h[y]);
  if (ry && ry[1] > 1440 && mins < ry[1] - 1440) return { cls: "", label: t("status.openUntil", { time: fmt(ry[1]) }), open: true };
  const r = parseRange(h[i]);
  if (r && mins >= r[0] && mins < r[1]) return { cls: "", label: t("status.openUntil", { time: fmt(r[1]) }), open: true };
  if (r && mins < r[0]) return { cls: "closed", label: t("status.opensAt", { time: fmt(r[0]) }), open: false };
  return { cls: "closed", label: t("status.closed"), open: false };
}

// Spécification schema.org des horaires (pour le référencement Google).
const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function openingSpec(hours) {
  return (hours || []).map((h, i) => {
    const r = parseRange(h);
    return r ? { "@type": "OpeningHoursSpecification", dayOfWeek: DOW[i], opens: fmt(r[0]), closes: fmt(r[1]) } : null;
  }).filter(Boolean);
}

module.exports = { parseRange, openStatus, openingSpec };
