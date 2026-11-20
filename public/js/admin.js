/* Espace gérant : confirmation en deux clics (pas de boîte de dialogue), copie du mot de passe temporaire. */
(function () {
  "use strict";
  function arm(btn, label) {
    if (btn.dataset.armed) return true;
    var original = btn.textContent;
    btn.dataset.armed = "1"; btn.textContent = label.replace(/\s*\?$/, "") + " — cliquez à nouveau";
    setTimeout(function () { delete btn.dataset.armed; btn.textContent = original; }, 4000);
    return false;
  }
  document.querySelectorAll("form[data-confirm]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      var btn = f.querySelector("button[type=submit]");
      if (!arm(btn, f.dataset.confirm)) e.preventDefault();
    });
  });
  document.querySelectorAll("button[data-confirm-btn]").forEach(function (b) {
    b.addEventListener("click", function (e) { if (!arm(b, b.dataset.confirmBtn)) e.preventDefault(); });
  });
  document.querySelectorAll("[data-copy-btn]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = b.parentNode.querySelector("[data-copy]");
      var done = function () { b.textContent = "Copié"; };
      if (navigator.clipboard) navigator.clipboard.writeText(el.textContent.trim()).then(done, function () { window.getSelection().selectAllChildren(el); });
      else window.getSelection().selectAllChildren(el);
    });
  });
})();
