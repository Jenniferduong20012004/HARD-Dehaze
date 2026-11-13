/**
 * Small polish effects. Everything here is progressive enhancement: with
 * JavaScript off the page is simply fully visible, and nothing below touches
 * layout or the behaviour of the other scripts.
 *
 *   1. Scroll progress bar (#scroll-progress) along the top edge.
 *   2. "Haze clears" scroll reveal: section content fades in out of a blur,
 *      the way a dehazed image sharpens. Skipped for reduced motion, for the
 *      banner (it has its own intro, see .banner in css/style.css) and for
 *      the spotlight sections (their media boxes already animate themselves).
 *   3. Comparison grid: the row under the pointer is lifted and the other
 *      rows dim, so one scene can be followed across eleven columns.
 */
(function () {
  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  /* ── 1. Scroll progress ── */
  const bar = document.createElement("div");
  bar.id = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);

  let barQueued = false;
  function updateBar() {
    barQueued = false;
    const root = document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0;
    bar.style.transform = "scaleX(" + p + ")";
  }
  function queueBar() {
    if (barQueued) return;
    barQueued = true;
    window.requestAnimationFrame(updateBar);
  }
  window.addEventListener("scroll", queueBar, { passive: true });
  window.addEventListener("resize", queueBar);
  updateBar();

  /* ── 2. Scroll reveal ── */
  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    const targets = Array.from(
      document.querySelectorAll(
        "main .section:not(.banner):not(.spotlight) > *"
      )
    );
    // Big grids of images are only faded and lifted: blurring ~100 images
    // at once is needlessly heavy for a sub-second effect.
    const SOFT = ".media-narrow, .qual-scroll, .table-card, .bibtex-wrap";

    targets.forEach((el) => {
      el.classList.add("reveal");
      if (el.matches(SOFT)) el.classList.add("reveal--soft");
    });

    const io = new IntersectionObserver(
      (entries) => {
        const showing = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        showing.forEach((entry, i) => {
          const el = entry.target;
          io.unobserve(el);
          // Items that arrive together are staggered a little, top first.
          el.style.transitionDelay = Math.min(i * 70, 280) + "ms";
          el.classList.add("is-visible");
          // Once settled, drop the helper classes entirely so the element
          // goes back to exactly its normal styles (own transitions, no
          // leftover will-change/filter).
          window.setTimeout(() => {
            el.classList.remove("reveal", "reveal--soft", "is-visible");
            el.style.transitionDelay = "";
          }, 1400 + Math.min(i * 70, 280));
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -5% 0px" }
    );
    targets.forEach((el) => io.observe(el));
  }

  /* ── 3. Comparison grid: hot row ── */
  const grid = document.querySelector(".qual-grid");
  if (grid) {
    let hot = null;
    function setHot(row) {
      if (row === hot) return;
      if (hot) hot.classList.remove("is-hot");
      hot = row;
      if (hot) hot.classList.add("is-hot");
      grid.classList.toggle("has-hot", !!hot);
    }
    grid.addEventListener("pointerover", (e) => {
      // Mouse only: on touch there is no hover to follow.
      if (e.pointerType && e.pointerType !== "mouse") return;
      const item = e.target.closest && e.target.closest(".qual-item");
      if (item) setHot(item.closest(".qual-row"));
    });
    grid.addEventListener("pointerleave", () => setHot(null));
  }
})();
