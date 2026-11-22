/*
 * @garkpit/page-kit runtime: motion attributes, the theme toggle and settle() for the critic.
 * No dependencies, no network. Reads its config from <script type="application/json" id="page-kit-config">.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var config = {};
  try {
    var cfgEl = document.getElementById("page-kit-config");
    if (cfgEl) config = JSON.parse(cfgEl.textContent || "{}");
  } catch (e) { config = {}; }
  var allowed = Array.isArray(config.motion) ? config.motion : null;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STORAGE_KEY = "page-kit-theme";

  /* ---------- theme ---------- */
  function effectiveTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") return explicit;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelToggles() {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", "Switch to " + next + " theme");
      if (!b.textContent || b.hasAttribute("data-auto-label")) {
        b.setAttribute("data-auto-label", "");
        b.textContent = next === "dark" ? "Dark" : "Light";
      }
    });
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest("[data-theme-toggle]") : null;
    if (!t) return;
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* storage blocked: not remembered */ }
    labelToggles();
  });

  window.addEventListener("hashchange", function () {
    var m = location.hash.match(/theme=(light|dark)/);
    if (m) { root.setAttribute("data-theme", m[1]); labelToggles(); }
  });

  /* ---------- items in a byline, kicker or dateline ---------- */
  var ITEM_SEPARATOR = /\s+([·•|])\s+/;
  function groupItems(el) {
    if (el.querySelector(".pk-item")) return;
    var texts = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (node) {
      if (!ITEM_SEPARATOR.test(node.nodeValue)) return;
      var parts = node.nodeValue.split(/\s+[·•|]\s+/);
      var seps = node.nodeValue.match(/\s+[·•|]\s+/g) || [];
      var frag = document.createDocumentFragment();
      parts.forEach(function (part, i) {
        var span = document.createElement("span");
        span.className = "pk-item";
        span.textContent = part + (i < seps.length ? " " + seps[i].trim() : "");
        frag.appendChild(span);
        if (i < seps.length) frag.appendChild(document.createTextNode(" "));
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ---------- motion ---------- */
  var nodes = [];
  function effectOf(el) {
    var name = el.getAttribute("data-motion");
    if (allowed && allowed.indexOf(name) === -1) return "fade";
    return name;
  }
  function prepare(el) {
    var name = effectOf(el);
    if (name !== el.getAttribute("data-motion")) el.setAttribute("data-motion", name);
    var delay = parseFloat(el.getAttribute("data-motion-delay") || "");
    if (isFinite(delay)) el.style.setProperty("--pk-delay", delay + "s");
    if (name === "cascade") {
      Array.prototype.forEach.call(el.children, function (c, i) { c.style.setProperty("--pk-i", String(i)); });
    } else if (name === "meter") {
      el.querySelectorAll(".bar").forEach(function (b, i) { b.style.setProperty("--pk-i", String(i)); });
    } else if (name === "words") {
      splitWords(el);
    } else if (name === "draw") {
      el.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect").forEach(function (s, i) {
        var len = 0;
        try { len = s.getTotalLength(); } catch (e) { len = 0; }
        if (!len) return;
        s.classList.add("pk-stroke");
        s.style.strokeDasharray = String(len);
        s.style.strokeDashoffset = String(len);
        s.style.setProperty("--pk-i", String(i));
      });
    } else if (name === "count") {
      var text = el.textContent || "";
      var m = /-?−?\d[\d,]*(\.\d+)?/.exec(text);
      if (m) {
        el.setAttribute("data-pk-final", text);
        el.__pkCount = {
          prefix: text.slice(0, m.index),
          suffix: text.slice(m.index + m[0].length),
          target: parseFloat(m[0].replace(/,/g, "").replace("−", "-")),
          decimals: m[1] ? m[1].length - 1 : 0,
          commas: m[0].indexOf(",") !== -1,
          minus: m[0].indexOf("−") !== -1,
        };
      }
    }
  }
  function splitWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    var i = 0;
    texts.forEach(function (node) {
      var parts = node.nodeValue.split(/(\s+)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
        var span = document.createElement("span");
        span.className = "pk-word";
        span.style.setProperty("--pk-i", String(i++));
        span.textContent = p;
        frag.appendChild(span);
      });
      node.parentNode.replaceChild(frag, node);
    });
  }
  function formatCount(c, v) {
    var s = Math.abs(v).toFixed(c.decimals);
    if (c.commas) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var sign = v < 0 ? (c.minus ? "−" : "-") : "";
    return c.prefix + sign + s + c.suffix;
  }
  function runCount(el) {
    var c = el.__pkCount;
    if (!c) return;
    var dur = (parseFloat(getComputedStyle(el).getPropertyValue("--dur-long")) || 1) * 1000;
    var start = performance.now();
    function tick(now) {
      if (el.__pkSettled) return;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = t >= 1 ? el.getAttribute("data-pk-final") : formatCount(c, c.target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    el.textContent = formatCount(c, 0);
    requestAnimationFrame(tick);
  }
  function enter(el) {
    if (el.classList.contains("pk-in")) return;
    el.classList.add("pk-in");
    var name = el.getAttribute("data-motion");
    if (name === "draw") el.querySelectorAll(".pk-stroke").forEach(function (s) { s.style.strokeDashoffset = "0"; });
    if (name === "count") runCount(el);
  }

  var scrollLinked = [];
  function updateScroll() {
    if (settled) return;
    var vh = window.innerHeight || 1;
    scrollLinked.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var name = el.getAttribute("data-motion");
      var p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      if (name === "scrub") el.style.setProperty("--progress", p.toFixed(4));
      else if (name === "zoom") el.style.setProperty("--pk-zoom", (1.08 - 0.08 * p).toFixed(4));
      else if (name === "drift") {
        var speed = Math.max(-0.3, Math.min(0.3, parseFloat(el.getAttribute("data-drift") || "0.12")));
        var centre = r.top + r.height / 2 - vh / 2;
        el.style.setProperty("--pk-drift", (-centre * speed).toFixed(1) + "px");
      }
    });
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateScroll(); });
  }

  function setFold() {
    root.style.setProperty("--pk-vh", (window.innerHeight / 100) + "px");
  }

  var settled = false;
  function settle() {
    settled = true;
    root.classList.add("pk-settled");
    nodes.forEach(function (el) {
      el.__pkSettled = true;
      el.classList.add("pk-in");
      if (el.getAttribute("data-motion") === "count" && el.hasAttribute("data-pk-final")) el.textContent = el.getAttribute("data-pk-final");
      if (el.getAttribute("data-motion") === "draw") el.querySelectorAll(".pk-stroke").forEach(function (s) { s.style.strokeDashoffset = "0"; });
      if (el.getAttribute("data-motion") === "zoom") el.style.setProperty("--pk-zoom", "1");
      if (el.getAttribute("data-motion") === "drift") el.style.setProperty("--pk-drift", "0px");
    });
    return nodes.length;
  }

  function init() {
    labelToggles();
    document.querySelectorAll(".byline, .dateline, .slate").forEach(groupItems);
    setFold();
    var lastWidth = window.innerWidth;
    window.addEventListener("resize", function () {
      // Only a width change moves the fold: a height-only resize (a capture, a toolbar) must not re-lay out the page.
      if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; setFold(); }
      onScroll();
    });
    nodes = Array.prototype.slice.call(document.querySelectorAll("[data-motion]"));
    nodes.forEach(prepare);
    if (reduced || !root.classList.contains("pk-motion")) { settle(); return; }
    var hash = location.hash + location.search;
    if (/pk-static/.test(hash)) { settle(); return; }
    // A fully clipped element (wipe, unveil) never intersects anything, so those are watched
    // through their parent: when the parent comes into view, its clipped children enter.
    var waiting = new Map();
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        (waiting.get(en.target) || []).forEach(enter);
        waiting.delete(en.target);
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 }) : null;
    nodes.forEach(function (el) {
      var name = el.getAttribute("data-motion");
      if (name === "zoom" || name === "drift" || name === "scrub") { scrollLinked.push(el); return; }
      if (!io) { enter(el); return; }
      var watch = (name === "wipe" || name === "unveil") && el.parentElement ? el.parentElement : el;
      if (!waiting.has(watch)) { waiting.set(watch, []); io.observe(watch); }
      waiting.get(watch).push(el);
    });
    if (scrollLinked.length) { window.addEventListener("scroll", onScroll, { passive: true }); updateScroll(); }
  }

  window.pageKit = { version: "0.1.0", settle: settle, theme: effectiveTheme, isSettled: function () { return settled; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
