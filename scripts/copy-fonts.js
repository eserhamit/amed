// Copie les polices auto-hébergées (aucun appel à Google Fonts : meilleur pour la vie privée des visiteurs).
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..", "public", "fonts");
fs.mkdirSync(out, { recursive: true });
const files = [
  ["@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2", "bsd-800.woff2"],
  ["@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff2", "bsd-900.woff2"],
  ["@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2", "is-400.woff2"],
  ["@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff2", "is-600.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", "jbm-400.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2", "jbm-600.woff2"]
];
for (const [src, dst] of files) {
  try { fs.copyFileSync(require.resolve(src), path.join(out, dst)); }
  catch (e) { console.warn("Police introuvable (ignorée) :", src); }
}
