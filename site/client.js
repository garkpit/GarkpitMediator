// Copy buttons, and the "you are here" marker in the docs sidebar. No dependencies, no network.
(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-copy]") : null;
    if (!button) return;
    var block = button.closest(".code");
    var code = block ? block.querySelector("pre code") : null;
    if (!code) return;
    var text = code.textContent || "";
    var done = function (label) {
      button.textContent = label;
      button.setAttribute("data-copied", "");
      setTimeout(function () {
        button.textContent = "Copy";
        button.removeAttribute("data-copied");
      }, 1600);
    };
    var fallback = function () {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(area);
      if (ok) { done("Copied"); return; }
      // The browser refused both ways (an unfocused or locked-down page). Select the code so the
      // reader's own copy shortcut does the job, and say which keys.
      var range = document.createRange();
      range.selectNodeContents(code);
      var selection = window.getSelection();
      if (selection) { selection.removeAllRanges(); selection.addRange(range); }
      done(/Mac|iPhone|iPad/.test(navigator.platform || "") ? "Press \u2318C" : "Press Ctrl+C");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done("Copied"); }, fallback);
    } else {
      fallback();
    }
  });

  var links = Array.prototype.slice.call(document.querySelectorAll(".on-page a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (link) { byId[decodeURIComponent(link.hash.slice(1))] = link; });
    var mark = function (id) {
      links.forEach(function (link) { link.removeAttribute("data-active"); });
      if (byId[id]) byId[id].setAttribute("data-active", "");
    };
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) mark(entry.target.id); });
    }, { rootMargin: "-15% 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var heading = document.getElementById(id);
      if (heading) observer.observe(heading);
    });
  }
})();
