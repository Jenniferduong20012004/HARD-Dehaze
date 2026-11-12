/**
 * Ambient drifting-smoke background: a fixed canvas layer sitting behind the
 * page content (z-index: -1 inside .page-shell, so it is painted over the
 * panel's white and under all text and images) -- the same "faded animated
 * layer" pattern used by canvas-nest.js on other project pages, but drawing
 * slow soft puffs of smoke instead of a particle network, a fitting backdrop
 * for a dehazing paper.
 *
 * Each puff is a pre-rendered soft radial-gradient sprite that rises, sways
 * sideways, swells and fades in and out over its life. Several overlapping
 * puffs read as a continuous haze rather than as separate blobs.
 *
 * Pointer interaction: the smoke is faint at rest and clears up where the
 * pointer is -- puffs near it become denser and part slightly around it, and
 * moving the pointer leaves a short trail of fresh wisps. The listeners are
 * on window, so the canvas itself never intercepts a click.
 *
 * Purely decorative: aria-hidden, pointer-events: none, and it freezes into
 * a single still frame (no interaction) for anyone who asked the OS for
 * reduced motion, matching how compare-slider.js and loupe-row.js behave.
 */
(function () {
  const canvas = document.createElement("canvas");
  canvas.id = "smoke-bg";
  canvas.setAttribute("aria-hidden", "true");
  // Inside the panel, not on <body>: see the header comment.
  const host = document.querySelector(".page-shell") || document.body;
  host.insertBefore(canvas, host.firstChild);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  // Tuned by eye: slow, large and overlapping enough to read as drifting haze.
  const DENSITY = 1 / 38000; // puffs per viewport px^2
  const MIN_COUNT = 14;
  const MIN_RADIUS = 90; // px, at birth
  const MAX_RADIUS = 210; // px, at birth
  const GROWTH = 0.9; // radius multiplier gained over a puff's life
  const MIN_RISE = 14; // px/s, upward drift
  const MAX_RISE = 36; // px/s
  const MAX_SWAY = 22; // px/s, sideways amplitude
  const MIN_LIFE = 14; // s
  const MAX_LIFE = 30; // s
  const PEAK_ALPHA = 0.55;
  const SMOKE_RGB = "122, 132, 145"; // cool mid gray: reads on white and on navy
  const SPRITE_SIZE = 256;

  // Pointer interaction.
  const HOVER_RADIUS = 260; // px: how far the cursor's influence reaches
  const HOVER_BOOST = 2.2; // extra alpha multiple at the cursor (1 + this)
  const HOVER_PUSH = 70; // px/s: how fast puffs part around the cursor
  const MAX_ALPHA = 0.75;
  const TRAIL_STEP = 26; // px of pointer travel per new trail wisp
  const MAX_TRAIL = 60;

  let width = 0;
  let height = 0;
  let puffs = [];
  let trail = [];
  let frame = null;
  let last = null;

  const pointer = { x: -9999, y: -9999, active: false, lastX: null, lastY: null };

  // One soft sprite, tinted once and scaled per puff. Several layered lobes
  // with an offset keep the puff from looking like a perfect circle.
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = SPRITE_SIZE;
  (function drawSprite() {
    const s = sprite.getContext("2d");
    const c = SPRITE_SIZE / 2;
    const lobes = [
      [0, 0, 0.62, 1],
      [-0.2, -0.12, 0.42, 0.7],
      [0.22, 0.1, 0.45, 0.7],
      [0.05, 0.25, 0.36, 0.55],
    ];
    for (const [ox, oy, r, a] of lobes) {
      const cx = c + ox * c;
      const cy = c + oy * c;
      const g = s.createRadialGradient(cx, cy, 0, cx, cy, r * c);
      g.addColorStop(0, "rgba(" + SMOKE_RGB + "," + 0.75 * a + ")");
      g.addColorStop(0.5, "rgba(" + SMOKE_RGB + "," + 0.32 * a + ")");
      g.addColorStop(1, "rgba(" + SMOKE_RGB + ",0)");
      s.fillStyle = g;
      s.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    }
  })();

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function makePuff(settleAnywhere) {
    const life = rand(MIN_LIFE, MAX_LIFE);
    const radius = rand(MIN_RADIUS, MAX_RADIUS);
    return {
      x: rand(-radius * 0.3, width + radius * 0.3),
      // Born just below the fold so new smoke rises into view; the first
      // frame is scattered over the whole viewport with a random age, so the
      // page does not start empty.
      y: settleAnywhere ? rand(0, height) : height + radius * 0.6,
      radius: radius,
      rise: rand(MIN_RISE, MAX_RISE),
      sway: rand(0.4, 1) * MAX_SWAY * (Math.random() < 0.5 ? -1 : 1),
      phase: rand(0, Math.PI * 2),
      rate: rand(0.08, 0.2), // rad/s of the sway
      life: life,
      age: settleAnywhere ? rand(0, life) : 0,
      peak: rand(0.55, 1) * PEAK_ALPHA,
      spin: rand(-0.06, 0.06), // rad/s
      angle: rand(0, Math.PI * 2),
      hl: 0, // 0..1, how strongly the pointer is lighting this puff up
    };
  }

  // A small, short-lived wisp left behind by the pointer.
  function makeWisp(x, y) {
    const life = rand(2.4, 4);
    return {
      x: x + rand(-8, 8),
      y: y + rand(-8, 8),
      radius: rand(34, 66),
      rise: rand(10, 26),
      sway: rand(-16, 16),
      phase: rand(0, Math.PI * 2),
      rate: rand(0.3, 0.7),
      life: life,
      age: 0,
      peak: rand(0.45, 0.7),
      spin: rand(-0.3, 0.3),
      angle: rand(0, Math.PI * 2),
      hl: 0,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.max(MIN_COUNT, Math.round(width * height * DENSITY));
    puffs = Array.from({ length: count }, () => makePuff(true));
    trail = [];
  }

  function drawPuff(p, growth) {
    const t = p.age / p.life; // 0..1
    // Smooth in and out so a puff is never seen popping into existence.
    const fade = Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));
    const alpha = Math.min(MAX_ALPHA, p.peak * fade * (1 + HOVER_BOOST * p.hl));
    if (alpha <= 0.002) return;
    const r = p.radius * (1 + growth * t);
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
    ctx.restore();
  }

  function paint() {
    ctx.clearRect(0, 0, width, height);
    for (const p of puffs) drawPuff(p, GROWTH);
    for (const w of trail) drawPuff(w, 0.6);
    ctx.globalAlpha = 1;
  }

  // Eased 0..1 closeness of a puff to the pointer; bigger puffs are reached
  // from further away because their body extends well past their centre.
  function closeness(p) {
    if (!pointer.active) return 0;
    const reach = HOVER_RADIUS + p.radius * 0.5;
    const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
    const k = Math.max(0, 1 - d / reach);
    return k * k;
  }

  function step(p, dt) {
    p.age += dt;
    p.phase += p.rate * dt;
    p.y -= p.rise * dt;
    p.x += Math.cos(p.phase) * p.sway * dt;
    p.angle += p.spin * dt;
  }

  function tick(now) {
    if (last === null) last = now;
    // Clamp so a backgrounded/stalled tab doesn't leap the smoke on return.
    const dt = Math.min(now - last, 50) / 1000;
    last = now;
    // Follow the target quickly but not instantly, so the smoke thickens and
    // thins around the pointer rather than popping.
    const ease = Math.min(1, dt * 5);

    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      step(p, dt);
      const target = closeness(p);
      p.hl += (target - p.hl) * ease;
      if (p.hl > 0.01) {
        // Part around the pointer, as smoke does when a hand moves through it.
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * p.hl * HOVER_PUSH * dt;
        p.y += (dy / d) * p.hl * HOVER_PUSH * dt;
      }
      if (p.age >= p.life) puffs[i] = makePuff(false);
    }

    for (let i = trail.length - 1; i >= 0; i--) {
      const w = trail[i];
      step(w, dt);
      if (w.age >= w.life) trail.splice(i, 1);
    }

    paint();
    frame = window.requestAnimationFrame(tick);
  }

  function start() {
    if (frame !== null) return;
    last = null;
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame === null) return;
    window.cancelAnimationFrame(frame);
    frame = null;
  }

  function sync() {
    if (reduceMotion.matches) {
      stop();
      paint(); // one still frame -- the layer still reads as smoke
    } else if (document.visibilityState !== "hidden") {
      start();
    }
  }

  function onPointerMove(e) {
    if (reduceMotion.matches) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    if (pointer.lastX === null) {
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
    }
    // One wisp per TRAIL_STEP px travelled, so a fast swipe leaves a streak
    // of smoke and a slow drift leaves a few.
    const dx = e.clientX - pointer.lastX;
    const dy = e.clientY - pointer.lastY;
    if (Math.hypot(dx, dy) >= TRAIL_STEP) {
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      trail.push(makeWisp(e.clientX, e.clientY));
      if (trail.length > MAX_TRAIL) trail.shift();
    }
  }

  function onPointerLeave() {
    pointer.active = false;
    pointer.lastX = pointer.lastY = null;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerMove, { passive: true });
  window.addEventListener("pointerup", function (e) {
    // A finger leaves the screen when it lifts; a mouse stays where it is.
    if (e.pointerType === "touch") onPointerLeave();
  });
  window.addEventListener("pointercancel", onPointerLeave);
  document.documentElement.addEventListener("mouseleave", onPointerLeave);
  window.addEventListener("blur", onPointerLeave);

  window.addEventListener("resize", () => {
    resize();
    sync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stop();
    else sync();
  });

  if (typeof reduceMotion.addEventListener === "function") {
    reduceMotion.addEventListener("change", sync);
  }

  resize();
  sync();
})();
