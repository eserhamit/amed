"use strict";
const dict = { fr: require("./fr"), en: require("./en") };
const LANGS = ["fr", "en"];

function get(obj, key) { return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function translator(lang) {
  const d = dict[lang] || dict.fr;
  return (key, vars) => {
    let s = get(d, key);
    if (s == null) s = get(dict.fr, key);
    if (s == null) return key;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
}
function pickLang(req) {
  const h = String(req.get("accept-language") || "").toLowerCase();
  const fr = h.indexOf("fr"), en = h.indexOf("en");
  return en !== -1 && (fr === -1 || en < fr) ? "en" : "fr";
}
module.exports = { translator, pickLang, LANGS };
