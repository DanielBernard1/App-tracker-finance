// Dependency-free SVG cash-flow timeline chart.
//   - Positive balance: blue filled area (guaranteed) + faded potential band.
//   - Negative balance: red filled area (mirrored), faded red potential.
//   - Fixed Y axis (default 15000 / −5000) for the All/EUR view; single-currency
//     views auto-scale to their own data (native units).
//   - 0-line, today marker, goal markers, month ticks, filter buttons, hover.
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  // Theme colors (overridable via opts.colors at render time).
  let POS = "#5b8cff", POS_LT = "#8fb0ff", NEG = "#ff6b6b", NEG_LT = "#ff9a9a";
  let GRID = "#2a2f3a", INK = "#e6e8ec", SURFACE = "#171a21";

  function e(tag, attrs, children) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (children) [].concat(children).forEach((c) => c && n.appendChild(c));
    return n;
  }
  function e2div(cls) { const d = document.createElement("div"); d.className = cls; return d; }
  function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // opts: {
  //   filter: "ALL"|"EUR"|"USD"|"CNY",
  //   fmt: (value, currency) => string,     // currency may be "EUR-equiv" for ALL
  //   fmtDate: iso => string, lang,
  //   labels: { guaranteed, potential, all },
  //   symbols: {EUR,USD,CNY},
  //   fixedAxis: { hi, lo },                 // used for ALL/EUR
  //   onMarkerClick, onFilterChange
  // }
  function render(container, projection, opts) {
    opts = opts || {};
    container.innerHTML = "";
    if (opts.colors) {
      const c = opts.colors;
      POS = c.pos || POS; POS_LT = c.posLt || POS_LT;
      NEG = c.neg || NEG; NEG_LT = c.negLt || NEG_LT;
      GRID = c.grid || GRID; INK = c.ink || INK; SURFACE = c.surface || SURFACE;
    }
    const L = opts.labels || { guaranteed: "Guaranteed", potential: "Potential", all: "All" };
    const filter = opts.filter || "ALL";
    const CURRENCIES = projection.currencies || ["EUR", "USD", "CNY"];
    const symbols = opts.symbols || { EUR: "€", USD: "$", CNY: "¥" };
    const fmt = opts.fmt || ((v) => String(Math.round(v)));
    const fmtDate = opts.fmtDate || ((s) => s);

    // ---- filter control ----
    const bar = e2div("tl-filter");
    [["ALL", L.all], ...CURRENCIES.map((c) => [c, symbols[c] + " " + c])].forEach(([key, lbl]) => {
      const b = document.createElement("button");
      b.className = "tl-fbtn" + (key === filter ? " active" : "");
      b.textContent = lbl;
      b.addEventListener("click", () => { if (opts.onFilterChange) opts.onFilterChange(key); });
      bar.appendChild(b);
    });
    container.appendChild(bar);

    // ---- pick the active series ----
    // ALL → EUR-equivalent combined; single currency → that currency's native series.
    const isAll = filter === "ALL";
    const active = isAll ? projection.combined : projection.byCur[filter];
    const confirmed = active.confirmed;
    const optimistic = active.optimistic;
    const activeCur = isAll ? "EUR" : filter; // ALL is shown in EUR-equivalent

    const PX_PER_DAY = 6;
    const H = 320;
    const padTop = 24, padBottom = 40, padLeft = 0, padRight = 16;
    const plotH = H - padTop - padBottom;
    const n = projection.dates.length;
    const W = Math.max(container.clientWidth || 360, n * PX_PER_DAY + padRight + 40);

    // ---- Y domain ----
    let hi, lo;
    if ((isAll || filter === "EUR") && opts.fixedAxis) {
      hi = opts.fixedAxis.hi; lo = opts.fixedAxis.lo;
    } else {
      hi = 0; lo = 0;
      for (let i = 0; i < n; i++) { hi = Math.max(hi, confirmed[i], optimistic[i]); lo = Math.min(lo, confirmed[i], optimistic[i]); }
      const pad = Math.max(50, (hi - lo) * 0.1);
      hi += pad; lo -= pad;
      if (hi <= 0) hi = pad; // always show a little above 0
    }
    // Clamp series to the visible band so fixed-axis overflow doesn't break paths.
    const clamp = (v) => Math.max(lo, Math.min(hi, v));

    const x = (i) => padLeft + i * PX_PER_DAY;
    const y = (v) => padTop + plotH - ((clamp(v) - lo) / (hi - lo)) * plotH;
    const y0 = y(0);

    const svg = e("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "timeline-svg" });

    // gridlines
    const yTicks = 4;
    for (let t = 0; t <= yTicks; t++) {
      const val = lo + (hi - lo) * (t / yTicks);
      svg.appendChild(e("line", { x1: 0, y1: y(val), x2: W, y2: y(val), stroke: GRID, "stroke-width": 1, "stroke-dasharray": "3 4" }));
    }
    // month ticks
    let lastMonth = "";
    for (let i = 0; i < n; i++) {
      const mk = projection.dates[i].slice(0, 7);
      if (mk !== lastMonth) {
        lastMonth = mk;
        svg.appendChild(e("line", { x1: x(i), y1: padTop, x2: x(i), y2: H - padBottom, stroke: GRID, "stroke-width": 1, opacity: 0.6 }));
        const label = e("text", { x: x(i) + 4, y: H - padBottom + 16, fill: INK, opacity: 0.55, "font-size": 11 });
        label.textContent = monthLabel(projection.dates[i], opts.lang);
        svg.appendChild(label);
      }
    }

    // ---- build point lists ----
    const confPts = [], optPts = [];
    for (let i = 0; i < n; i++) { confPts.push(`${x(i)},${y(confirmed[i])}`); optPts.push(`${x(i)},${y(optimistic[i])}`); }

    // ---- POSITIVE fills (clipped to above the 0-line) ----
    // We fill between the 0-line and the curve; positive portions use blue,
    // negative portions use red, split at y0.
    // Positive guaranteed area: from 0-line up to curve where curve>0.
    appendSplitArea(svg, confirmed, x, y, y0, n);

    // ---- POTENTIAL band (between confirmed and optimistic) ----
    // Positive upside = blue low-opacity; negative extension = red low-opacity.
    const bandPath = "M" + optPts.join(" L") + " L" + confPts.slice().reverse().join(" L") + " Z";
    // color the band by whether we're mostly above or below — simpler: draw twice clipped.
    svg.appendChild(e("path", { d: bandPath, fill: POS, opacity: 0.18 }));

    // ---- lines ----
    svg.appendChild(e("polyline", { points: optPts.join(" "), fill: "none", stroke: POS_LT, "stroke-width": 1.5, opacity: 0.5 }));
    // guaranteed line, colored per-segment (blue above 0, red below 0)
    appendSplitLine(svg, confirmed, x, y, 2);

    // ---- 0-line (solid, emphasized) ----
    svg.appendChild(e("line", { x1: 0, y1: y0, x2: W, y2: y0, stroke: INK, "stroke-width": 1.5, opacity: 0.55 }));

    // ---- today marker ----
    svg.appendChild(e("line", { x1: x(0), y1: padTop, x2: x(0), y2: H - padBottom, stroke: INK, "stroke-width": 1.5, opacity: 0.3 }));

    // ---- goal markers ----
    (projection.markers || []).forEach((mk) => {
      const i = mk.dateIndex;
      const g = e("g", { class: "goal-marker" });
      g.appendChild(e("line", { x1: x(i), y1: padTop - 6, x2: x(i), y2: H - padBottom, stroke: mk.bought ? "#ffb020" : "#c792ff", "stroke-width": 1.5, "stroke-dasharray": "4 3", opacity: 0.85 }));
      g.appendChild(e("circle", { cx: x(i), cy: padTop - 6, r: 5, fill: mk.bought ? "#ffb020" : "#c792ff", class: "goal-flag" }));
      if (opts.onMarkerClick) { g.style.cursor = "pointer"; g.addEventListener("click", (ev) => { ev.stopPropagation(); opts.onMarkerClick(mk, ev.clientX, ev.clientY); }); }
      svg.appendChild(g);
    });

    // ---- event dots (filtered to active currency unless ALL) ----
    const colorFor = { income: "#39d98a", expected: POS, expense: NEG, goalbought: "#ffb020" };
    (projection.events || []).forEach((ev) => {
      if (!isAll && ev.currency !== filter) return;
      const i = ev.dateIndex;
      const isOpt = ev.type === "expected";
      const cy = y(isOpt ? optimistic[i] : confirmed[i]);
      // in ALL view the active series is EUR-equiv; still place dots on the line
      const dot = e("circle", { cx: x(i), cy: cy, r: 3.2, fill: colorFor[ev.type] || "#8b93a1", opacity: isOpt ? 0.5 : 0.9, class: "event-dot" });
      const title = e("title");
      title.textContent = `${fmtDate(projection.dates[i])} · ${ev.label} · ${ev.amount >= 0 ? "+" : ""}${fmt(ev.amount, ev.currency)}`;
      dot.appendChild(title);
      svg.appendChild(dot);
    });

    // ---- hover crosshair ----
    const cross = e("g", { class: "tl-cross", opacity: 0 });
    const crossLine = e("line", { x1: 0, y1: padTop, x2: 0, y2: H - padBottom, stroke: INK, "stroke-width": 1, opacity: 0.55 });
    const dotC = e("circle", { r: 4.5, fill: POS, stroke: SURFACE, "stroke-width": 1.5 });
    cross.appendChild(crossLine); cross.appendChild(dotC);
    svg.appendChild(cross);

    const scroller = e2div("timeline-scroll");
    scroller.appendChild(svg);
    container.appendChild(scroller);

    // y-axis overlay
    const yOverlay = e2div("timeline-yaxis");
    for (let t = yTicks; t >= 0; t--) {
      const val = lo + (hi - lo) * (t / yTicks);
      const lab = document.createElement("div");
      lab.className = "y-tick";
      lab.style.top = (y(val) - 7) + "px";
      lab.textContent = (symbols[activeCur] || "") + shortNum(val);
      yOverlay.appendChild(lab);
    }
    container.appendChild(yOverlay);

    // ---- tooltip ----
    const tip = e2div("tl-tip");
    tip.style.display = "none";
    container.appendChild(tip);

    function hideHover() { cross.setAttribute("opacity", 0); tip.style.display = "none"; }
    function showHoverAt(clientX) {
      const r = svg.getBoundingClientRect();
      let i = Math.round((clientX - r.left - padLeft) / PX_PER_DAY);
      i = Math.max(0, Math.min(n - 1, i));
      const cx = x(i);
      crossLine.setAttribute("x1", cx); crossLine.setAttribute("x2", cx);
      dotC.setAttribute("cx", cx); dotC.setAttribute("cy", y(confirmed[i]));
      cross.setAttribute("opacity", 1);

      // headline: active series value; breakdown: per-currency native
      let rows = "";
      if (isAll) {
        rows += tipRow("sw-confirmed", L.guaranteed, fmt(confirmed[i], "EUR"));
        if (optimistic[i] - confirmed[i] > 0.005) rows += tipRow("sw-optimistic", L.potential, fmt(optimistic[i], "EUR"));
        rows += '<div class="tl-tip-div"></div>';
        CURRENCIES.forEach((c) => {
          const v = projection.byCur[c].confirmed[i];
          if (Math.abs(v) > 0.005 || projection.byCur[c].start !== 0) rows += tipCur(symbols[c], fmt(v, c));
        });
      } else {
        rows += tipRow("sw-confirmed", L.guaranteed, fmt(confirmed[i], filter));
        if (optimistic[i] - confirmed[i] > 0.005) rows += tipRow("sw-optimistic", L.potential, fmt(optimistic[i], filter));
      }
      tip.innerHTML = '<div class="tl-tip-date">' + escHtml(fmtDate(projection.dates[i])) + '</div>' + rows;

      const cr = container.getBoundingClientRect();
      tip.style.display = "block";
      const tw = tip.offsetWidth || 150;
      let left = clientX - cr.left + 12;
      if (left + tw > cr.width - 4) left = clientX - cr.left - tw - 12;
      if (left < 4) left = 4;
      tip.style.left = left + "px";
      tip.style.top = "40px";
    }
    function tipRow(sw, lbl, val) { return '<div class="tl-tip-row"><span class="sw ' + sw + '"></span><span class="tl-tip-lbl">' + escHtml(lbl) + '</span><span class="tl-tip-val">' + escHtml(val) + '</span></div>'; }
    function tipCur(sym, val) { return '<div class="tl-tip-row tl-tip-cur"><span class="tl-tip-lbl">' + escHtml(sym) + '</span><span class="tl-tip-val">' + escHtml(val) + '</span></div>'; }

    function onMove(ev) { const pt = ev.touches ? ev.touches[0] : ev; if (pt) showHoverAt(pt.clientX); }
    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseleave", hideHover);
    svg.addEventListener("touchstart", onMove, { passive: true });
    svg.addEventListener("touchmove", onMove, { passive: true });
    svg.addEventListener("touchend", hideHover);

    return { svg, scroller };
  }

  // Fill between the 0-line and the curve, blue where curve>0, red where curve<0.
  function appendSplitArea(svg, series, x, y, y0, n) {
    // positive area
    let posPath = "", open = false;
    for (let i = 0; i < n; i++) {
      const v = series[i];
      if (v > 0) {
        if (!open) { posPath += `M${x(i)},${y0} `; open = true; }
        posPath += `L${x(i)},${y(v)} `;
        if (i === n - 1 || series[i + 1] <= 0) { posPath += `L${x(i)},${y0} Z `; open = false; }
      }
    }
    if (posPath) svg.appendChild(e("path", { d: posPath.trim(), fill: POS, opacity: 0.55 }));
    // negative area
    let negPath = ""; open = false;
    for (let i = 0; i < n; i++) {
      const v = series[i];
      if (v < 0) {
        if (!open) { negPath += `M${x(i)},${y0} `; open = true; }
        negPath += `L${x(i)},${y(v)} `;
        if (i === n - 1 || series[i + 1] >= 0) { negPath += `L${x(i)},${y0} Z `; open = false; }
      }
    }
    if (negPath) svg.appendChild(e("path", { d: negPath.trim(), fill: NEG, opacity: 0.5 }));
  }

  // Draw the guaranteed line colored blue above 0, red below 0.
  function appendSplitLine(svg, series, x, y, w) {
    const pts = series.map((v, i) => [x(i), y(v), v]);
    let seg = [], segNeg = pts[0][2] < 0;
    const flush = () => {
      if (seg.length < 2) { seg = seg.slice(-1); return; }
      svg.appendChild(e("polyline", { points: seg.map((p) => p[0] + "," + p[1]).join(" "), fill: "none", stroke: segNeg ? NEG : POS, "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      seg = seg.slice(-1);
    };
    for (let i = 0; i < pts.length; i++) {
      const neg = pts[i][2] < 0;
      if (i > 0 && neg !== segNeg) { seg.push(pts[i]); flush(); segNeg = neg; }
      seg.push(pts[i]);
    }
    flush();
  }

  function monthLabel(iso, lang) {
    const d = new Date(iso + "T00:00:00");
    const locale = lang === "zh" ? "zh-CN" : "en-US";
    if (d.getMonth() === 0) return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
    return d.toLocaleDateString(locale, { month: "short" });
  }
  function shortNum(v) {
    const abs = Math.abs(v);
    if (abs >= 1000) { const k = v / 1000; return (k % 1 === 0 ? k : k.toFixed(1)) + "k"; }
    return Math.round(v).toString();
  }

  window.Chart = { render };
})();
