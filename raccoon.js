// A little easter-egg raccoon hiding behind the Goals column (upper-right).
// Hidden: a small gray half-circle (his back) with a few tufts of hair poking
// above the card edge. Tap him a random number of times (1–10, normal
// distribution, mean ~5) and he sits up and turns around to face you, then
// auto-hides after a few seconds and re-rolls the target.
(function () {
  "use strict";

  // Box–Muller normal sample → integer clamped to [min,max].
  // mean centered, sd chosen so ~99% of mass lands within the range.
  function normalInt(min, max) {
    // Center at the midpoint of the integer bins. Math.round maps a continuous
    // value in [k-0.5, k+0.5) to k, so to get integers 1..10 symmetrically we
    // center the continuous distribution at (min+max)/2 and give it enough
    // spread to reach the ends, then clamp.
    const mid = (min + max) / 2;          // 5.5 for 1..10
    const sd = (max - min + 1) / 6;       // ~1.67 → ±3sd covers 0.5..10.5
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let n = Math.round(mid + z * sd);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }
  // exposed for tests
  function rollTapTarget() { return normalInt(1, 10); }

  const BACK_SVG = `
    <svg viewBox="0 0 60 34" width="100%" height="100%" aria-hidden="true">
      <!-- tufts of hair -->
      <path class="rc-fur" d="M14 12 l-3 -7 l4 4 l2 -6 l2 6 l3 -5 l1 6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="rc-fur" d="M40 12 l3 -6 l1 5 l3 -6 l2 6 l3 -4 l1 5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- rounded back (half circle) -->
      <path class="rc-body" d="M4 34 a26 26 0 0 1 52 0 Z"/>
      <!-- two little ear bumps -->
      <circle class="rc-body" cx="16" cy="12" r="6"/>
      <circle class="rc-body" cx="44" cy="12" r="6"/>
    </svg>`;

  const FRONT_SVG = `
    <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden="true">
      <!-- ears -->
      <circle class="rc-body" cx="16" cy="12" r="8"/>
      <circle class="rc-body" cx="44" cy="12" r="8"/>
      <circle class="rc-ear" cx="16" cy="13" r="4"/>
      <circle class="rc-ear" cx="44" cy="13" r="4"/>
      <!-- head -->
      <circle class="rc-body" cx="30" cy="30" r="22"/>
      <!-- mask -->
      <path class="rc-mask" d="M10 28 q8 -9 20 -9 q12 0 20 9 q-6 8 -20 8 q-14 0 -20 -8 Z"/>
      <!-- eyes -->
      <circle class="rc-eye" cx="22" cy="28" r="3.4"/>
      <circle class="rc-eye" cx="38" cy="28" r="3.4"/>
      <circle class="rc-eye-sh" cx="23" cy="27" r="1.1"/>
      <circle class="rc-eye-sh" cx="39" cy="27" r="1.1"/>
      <!-- snout -->
      <path class="rc-snout" d="M24 38 q6 6 12 0 q-6 5 -12 0 Z"/>
      <circle class="rc-nose" cx="30" cy="39" r="2.4"/>
    </svg>`;

  // Mount the raccoon into a host element (the goals column). Returns the API.
  function mount(hostColumn) {
    if (!hostColumn) return null;
    // ensure the column can anchor an absolutely-positioned child
    if (getComputedStyle) {
      // set inline so we don't depend on a CSS edit landing
      hostColumn.style.position = hostColumn.style.position || "relative";
    } else {
      hostColumn.style.position = "relative";
    }

    const wrap = document.createElement("div");
    wrap.className = "raccoon hiding";
    wrap.setAttribute("role", "button");
    wrap.setAttribute("aria-label", "raccoon");
    wrap.innerHTML = '<div class="rc-back">' + BACK_SVG + '</div><div class="rc-front">' + FRONT_SVG + '</div>';
    hostColumn.appendChild(wrap);

    const state = { taps: 0, target: rollTapTarget(), turned: false, resetTimer: null };

    function hide() {
      state.turned = false;
      state.taps = 0;
      state.target = rollTapTarget();
      wrap.classList.remove("turned", "wiggle");
      wrap.classList.add("hiding");
    }

    function turnAround() {
      state.turned = true;
      wrap.classList.remove("hiding", "wiggle");
      wrap.classList.add("turned");
      if (state.resetTimer) clearTimeout(state.resetTimer);
      state.resetTimer = setTimeout(hide, 4000); // auto-hide after a few seconds
    }

    function tap() {
      if (state.turned) return; // ignore taps while facing you
      state.taps++;
      // little wiggle feedback
      wrap.classList.remove("wiggle");
      // force reflow so the animation can replay
      void wrap.offsetWidth;
      wrap.classList.add("wiggle");
      if (state.taps >= state.target) turnAround();
    }

    wrap.addEventListener("click", tap);

    return { el: wrap, tap, hide, turnAround, _state: state };
  }

  window.Raccoon = { mount, rollTapTarget, normalInt };
})();
