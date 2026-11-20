/* Pub Goudale — petites améliorations côté navigateur. Le site fonctionne sans JavaScript. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fill = function (tpl, v) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); };
  var chf = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'"); };

  /* Places restantes pendant la saisie d'une réservation */
  var hint = $("#availHint"), form = $("#resaForm"), tok = 0, timer;
  function checkAvail() {
    if (!hint || !form) return;
    var pub = $("input[name=pub]:checked", form), date = $("#f-date"), time = $("#f-time");
    if (!pub || !date.value || !time.value) { hint.textContent = ""; return; }
    var my = ++tok, name = pub.parentNode.querySelector("span").firstChild.textContent.trim();
    fetch("/api/disponibilite?pub=" + encodeURIComponent(pub.value) + "&date=" + encodeURIComponent(date.value) + "&time=" + encodeURIComponent(time.value), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (my !== tok || !d) return;
        hint.className = "hint";
        if (!d.open) { hint.textContent = hint.dataset.closed; hint.className = "hint full"; }
        else if (d.left === null) { hint.textContent = ""; }
        else if (d.left === 0) { hint.textContent = fill(hint.dataset.full, { pub: name }); hint.className = "hint full"; }
        else { hint.textContent = fill(hint.dataset.left, { n: d.left, pub: name }); }
      }).catch(function () { hint.textContent = ""; });
  }
  $$("[data-avail]").forEach(function (el) { el.addEventListener("change", function () { clearTimeout(timer); timer = setTimeout(checkAvail, 150); }); });
  checkAvail();

  /* Estimation du prix d'un groupe */
  var est = $("#estimate");
  function estimate() {
    if (!est) return;
    var f = $("input[name=formule]:checked"), pers = +($("#g-pers") || {}).value || 0, budget = +($("#g-budget") || {}).value || 0;
    var pp = f ? +f.dataset.pp : 0;
    if (!pp) { est.innerHTML = ""; var l = document.createElement("span"); l.className = "flabel"; l.textContent = est.dataset.label; var s = document.createElement("span"); s.textContent = est.dataset.custom; est.append(l, s); return; }
    var total = pp * pers;
    est.innerHTML = "";
    var lab = document.createElement("span"); lab.className = "flabel"; lab.textContent = est.dataset.label + " · " + f.dataset.name;
    var big = document.createElement("b"); big.className = "mono"; big.textContent = chf(total) + " CHF";
    var note = document.createElement("span"); note.className = "muted small"; note.textContent = fill(est.dataset.note, { n: pers, pp: pp });
    est.append(lab, big, note);
    if (budget > 0 && total > budget) {
      var alt = $$("input[name=formule]").filter(function (x) { return +x.dataset.pp > 0 && +x.dataset.pp * pers <= budget; })
        .sort(function (a, b) { return b.dataset.pp - a.dataset.pp; })[0];
      var tip = document.createElement("span"); tip.className = "hint full";
      tip.textContent = fill(est.dataset.over, { budget: chf(budget) }) + " " + (alt ? fill(est.dataset.alt, { name: alt.dataset.name, total: chf(alt.dataset.pp * pers) }) : est.dataset.none);
      est.append(tip);
    }
  }
  $$("[data-est]").forEach(function (el) { el.addEventListener("input", estimate); el.addEventListener("change", estimate); });
  estimate();

  /* Compte à rebours Concorde */
  var cd = $("#countdown");
  if (cd && cd.dataset.date) {
    var target = new Date(cd.dataset.date + "T18:00:00").getTime(), units = cd.dataset.units.split(",");
    var tick = function () {
      var t = target - Date.now();
      cd.innerHTML = "";
      if (t <= 0) { var d0 = document.createElement("div"); d0.className = "wide"; var b0 = document.createElement("b"); b0.textContent = cd.dataset.opened; d0.append(b0); cd.append(d0); return; }
      [Math.floor(t / 864e5), Math.floor(t / 36e5) % 24, Math.floor(t / 6e4) % 60, Math.floor(t / 1e3) % 60].forEach(function (v, i) {
        var d = document.createElement("div"), b = document.createElement("b"), s = document.createElement("span");
        b.textContent = String(v).padStart(2, "0"); s.textContent = units[i]; d.append(b, s); cd.append(d);
      });
      setTimeout(tick, 1000);
    };
    tick();
  }

  /* Confirmation avant une action irréversible (annulation) */
  $$("form[data-confirm]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      if (f.dataset.ok) return;
      e.preventDefault();
      var btn = f.querySelector("button[type=submit]");
      btn.textContent = f.dataset.confirm.replace(/\s*\?$/, "");
      f.dataset.ok = "1";
    });
  });

  /* Après une erreur, on amène le visiteur au formulaire concerné */
  var err = $(".errors[role=alert]");
  if (err) err.scrollIntoView({ block: "center" });
})();
