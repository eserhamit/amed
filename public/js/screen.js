/* Mode écran TV : diaporama plein écran, données rafraîchies chaque minute (aucune donnée personnelle). */
(function () {
  "use strict";
  var root = document.getElementById("screen"), slideEl = document.getElementById("sSlide"), dots = document.getElementById("sDots");
  var slides = [], idx = 0;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function render() {
    if (!slides.length) return;
    if (idx >= slides.length) idx = 0;
    var s = slides[idx]; slideEl.innerHTML = "";
    slideEl.append(el("span", "k", s.k));
    if (s.title) slideEl.append(el("h2", null, s.title));
    if (s.sub) slideEl.append(el("span", "sd", s.sub));
    if (s.price) slideEl.append(el("span", "px", s.price));
    if (s.list) { var l = el("div", "list"); s.list.forEach(function (row) { var li = el("div", "li"); li.append(el("span", null, row[0]), el("span", "mono", row[1] || "")); l.append(li); }); slideEl.append(l); }
    dots.innerHTML = ""; slides.forEach(function (_, i) { dots.append(el("i", i === idx ? "on" : "")); });
  }
  function load() {
    fetch("/api/ecran?pub=" + encodeURIComponent(root.dataset.pub || "") + "&lang=" + encodeURIComponent(root.dataset.lang || "fr"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (!d) return; slides = d.slides || []; if (d.pub) document.getElementById("sPub").textContent = d.pub.toUpperCase(); render(); })
      .catch(function () {});
  }
  function clock() { var n = new Date(); document.getElementById("sClock").textContent = String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"); }
  load(); clock();
  setInterval(load, 60000); setInterval(clock, 5000);
  setInterval(function () { idx++; render(); }, 10000);
  if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(function () {});
  document.addEventListener("dblclick", function () { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); });
})();
