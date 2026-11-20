"use strict";
// Lecture du contenu du site (pubs, carte, menu, matchs…) avec un petit cache mémoire,
// vidé à chaque modification dans l'espace gérant.
const db = require("../db");
const { json, dayIdx } = require("./util");

let cache = null;
let cacheAt = 0;
const TTL = 30 * 1000;

function invalidate() { cache = null; }

async function settingsMap() {
  const rows = await db("settings").select();
  const m = {};
  rows.forEach(r => { m[r.key] = r.value; });
  return m;
}
async function setSetting(key, value) {
  const v = value == null ? "" : String(value);
  const n = await db("settings").where({ key }).update({ value: v });
  if (!n) await db("settings").insert({ key, value: v });
  invalidate();
}

async function load() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const [pubs, items, week, matches, formules, settings, photos] = await Promise.all([
    db("pubs").orderBy("sort"),
    db("menu_items").orderBy(["kind", "sort", "id"]),
    db("week_menu").orderBy("day"),
    db("matches").orderBy(["day", "time", "sort"]),
    db("formules").orderBy(["sort", "id"]),
    settingsMap(),
    db("photos").select("id", "slot", "file", "width", "height", "alt", "alt_en", "sort").orderBy(["slot", "sort", "id"])
  ]);
  pubs.forEach(p => { p.hours = json(p.hours, ["", "", "", "", "", "", ""]); });
  items.forEach(i => { i.sold_out = !!i.sold_out; });
  const weekFull = [0, 1, 2, 3, 4].map(d => week.find(w => w.day === d) || { day: d, name: "", name_en: "", descr: "", descr_en: "", price: "" });
  cache = {
    pubs, openPubs: pubs.filter(p => p.status !== "soon"),
    beers: items.filter(i => i.kind === "beer"), food: items.filter(i => i.kind === "food"),
    week: weekFull, matches, formules, settings, photos,
    photo: slot => photos.find(p => p.slot === slot) || null,
    gallery: photos.filter(p => p.slot === "gallery")
  };
  cacheAt = Date.now();
  return cache;
}

// Choisit la version anglaise d'un champ si elle existe, sinon le français.
function tr(obj, field, lang) { return (lang === "en" && obj && obj[field + "_en"]) || (obj && obj[field]) || ""; }

function matchesToday(c) { const d = dayIdx(); return c.matches.filter(m => m.day === d); }

module.exports = { load, invalidate, settingsMap, setSetting, tr, matchesToday };
