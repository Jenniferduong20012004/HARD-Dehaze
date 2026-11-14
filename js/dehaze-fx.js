/**
 * Dehaze-themed effects:
 *   1. Title dehaze: each word in h1 starts blurred and sharpens left-to-right
 *   2. Fog wisps: thin horizontal streaks of fog drift across the page
 *   3. Full-page dehaze: page starts hazy, click DEHAZE to sweep clear,
 *      right = hazy, demonstrating the paper's concept on the page itself
 *
 * All are progressive enhancement (skipped for reduced motion) and
 * purely decorative (aria-hidden, pointer-events: none).
 */
(function () {
  var rm = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  if (rm.matches) return;

  /* ── 1. Title dehaze animation ──────────────────────────────────────────── */
  var h1 = document.querySelector(".hero h1");
  if (h1) {
    var words = h1.textContent.trim().split(/\s+/);
    h1.innerHTML = words
      .map(function (w, i) {
        return '<span class="dh-word" style="--wi:' + i + '">' + w + "</span>";
      })
      .join(" ");
  }

  /* ── 2. Drifting fog wisps ──────────────────────────────────────────────── */
  var shell = document.querySelector(".page-shell") || document.body;
  var fog = document.createElement("div");
  fog.className = "fog-wisps";
  fog.setAttribute("aria-hidden", "true");
  shell.appendChild(fog);

  for (var i = 0; i < 6; i++) {
    var w = document.createElement("div");
    w.className = "fog-wisp";
    w.style.setProperty("--fi", i);
    fog.appendChild(w);
  }
})();

/* ── 4. Full-page dehaze: page starts hazy, click to clear ───────────────── */
(function () {
  var rm = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  if (rm.matches) return;

  var SVG_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  // DEHAZE button — starts centered with "Click to Dehaze", pulses
  var btn = document.createElement("button");
  btn.className = "dehaze-btn is-on is-pulse";
  btn.innerHTML = "Click to Dehaze";
  btn.setAttribute("title", "Click to clear the haze");
  document.body.appendChild(btn);

  // Full-page haze overlay (starts ON, covers everything)
  var wrap = document.createElement("div");
  wrap.className = "page-dehaze is-on is-initial";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML =
    '<div class="page-dehaze__fog"></div>' +
    '<div class="page-dehaze__bar">' +
    '<span class="page-dehaze__arrows">◀ ▶</span>' +
    "</div>" +
    '<span class="page-dehaze__tag page-dehaze__tag--l">Clear</span>' +
    '<span class="page-dehaze__tag page-dehaze__tag--r">Hazy</span>';
  document.body.appendChild(wrap);

  // Start with full haze (--sx: 0% = entire page is foggy)
  wrap.style.setProperty("--sx", "0%");

  var barEl = wrap.querySelector(".page-dehaze__bar");
  var on = true;
  var firstTime = true;
  var dragging = false;
  var split = 0;

  function setPos(ratio) {
    split = Math.max(0, Math.min(1, ratio));
    wrap.style.setProperty("--sx", (split * 100).toFixed(2) + "%");
  }

  function deactivate() {
    on = false;
    wrap.classList.remove("is-on", "is-dragging", "is-initial");
    btn.classList.remove("is-on");
  }

  function activateSlider() {
    on = true;
    setPos(0.28);
    wrap.classList.add("is-on");
    wrap.classList.remove("is-initial");
    btn.classList.add("is-on");
  }

  btn.addEventListener("click", function () {
    if (firstTime) {
      // First click: sweep the haze away left-to-right
      firstTime = false;
      btn.classList.remove("is-pulse");
      btn.classList.add("is-corner");
      btn.innerHTML = SVG_ICON + " Dehaze";
      wrap.classList.remove("is-initial");

      var start = performance.now();
      var duration = 1400;
      (function sweep(now) {
        var t = Math.min((now - start) / duration, 1);
        var ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
        setPos(ease);
        if (t < 1) {
          requestAnimationFrame(sweep);
        } else {
          deactivate();
        }
      })(start);
      return;
    }

    // After first time: toggle slider mode
    if (on) deactivate();
    else activateSlider();
  });

  // Drag via Pointer Events with capture (only after first sweep)
  barEl.addEventListener("pointerdown", function (e) {
    if (!on || firstTime) return;
    dragging = true;
    barEl.setPointerCapture(e.pointerId);
    wrap.classList.add("is-dragging");
    e.preventDefault();
  });

  barEl.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    setPos(e.clientX / window.innerWidth);
  });

  barEl.addEventListener("pointerup", function () {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove("is-dragging");
    if (split > 0.96) deactivate();
  });

  barEl.addEventListener("lostpointercapture", function () {
    dragging = false;
    wrap.classList.remove("is-dragging");
  });

  wrap.addEventListener("pointerdown", function (e) {
    if (!on || firstTime || e.target === barEl || barEl.contains(e.target)) return;
    setPos(e.clientX / window.innerWidth);
  });
})();
