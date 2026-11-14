/**
 * Three dehaze-themed effects:
 *   1. Title dehaze: each word in h1 starts blurred and sharpens left-to-right
 *   2. Cursor dehaze: a fog overlay on the banner clears around the pointer
 *   3. Fog wisps: thin horizontal streaks of fog drift across the page
 *
 * All three are progressive enhancement (skipped for reduced motion) and
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

  /* ── 2. Cursor dehaze on banner ─────────────────────────────────────────── */
  var banner = document.querySelector(".banner");
  if (banner) {
    var overlay = document.createElement("div");
    overlay.className = "dehaze-cursor";
    overlay.setAttribute("aria-hidden", "true");
    banner.appendChild(overlay);

    banner.addEventListener(
      "pointermove",
      function (e) {
        var r = banner.getBoundingClientRect();
        overlay.style.setProperty("--cx", (e.clientX - r.left) + "px");
        overlay.style.setProperty("--cy", (e.clientY - r.top) + "px");
      },
      { passive: true }
    );

    banner.addEventListener("pointerleave", function () {
      overlay.style.setProperty("--cx", "-200px");
      overlay.style.setProperty("--cy", "-200px");
    });
  }

  /* ── 3. Drifting fog wisps ──────────────────────────────────────────────── */
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
