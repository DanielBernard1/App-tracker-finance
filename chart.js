// Minimal dependency-free SVG line chart for the cash-flow timeline.
// Renders a scrollable "stock chart" style view:
//   - faded area/line = optimistic (confirmed + potential income)
//   - solid line      = confirmed balance
//   - shaded band between them = upside from expected income
//   - zero line, today marker, event dots, x-axis month ticks, y-axis labels
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function e(tag, attrs, children) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (children) [].concat(children).forEach((c) => c && n.appendChild(c));
    return n;
  }

  // series: output of Projection.project
  // fmtMoney(value) -> string ; fmtDate(iso) -> string
  function render(container, series, fmtMoney, fmtDate, lang) {
    container.innerHTML = "";

    const PX_PER_DAY = 6;         // horizontal density (scroll to see all)
    const H = 320;                // chart height
    const padTop = 24, padBottom = 40, padLeft = 0, padRight = 16;
    const plotH = H - padTop - padBottom;
    const n = series.dates.length;
    const W = Math.max(container.clientWidth || 360, n * PX_PER_DAY + padRight + 40);

    // y-domain across both series (include 0)
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, series.confirmed[i], series.optimistic[i]);
      hi = Math.max(hi, series.confirmed[i], series.optimistic[i]);
    }
    if (hi === lo) hi = lo + 100;
    const padY = (hi - lo) * 0.08;
    lo -= padY; hi += padY;

    const x = (i) => padLeft + i * PX_PER_DAY;
    const y = (v) => padTop + plotH - ((v - lo) / (hi - lo)) * plotH;

    const svg = e("svg", {
      width: W, height: H, viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "none", class: "timeline-svg",
    });

    // ----- gridlines + y labels (fixed overlay handles labels; here draw lines) -----
    const yTicks = 4;
    for (let t = 0; t <= yTicks; t++) {
      const val = lo + (hi - lo) * (t / yTicks);
      const yy = y(val);
      svg.appendChild(e("line", {
        x1: 0, y1: yy, x2: W, y2: yy,
        stroke: "#2a2f3a", "stroke-width": 1, "stroke-dasharray": t === 0 ? "" : "3 4",
      }));
    }

    // zero line (emphasised if within range)
    if (lo < 0 && hi > 0) {
      svg.appendChild(e("line", {
        x1: 0, y1: y(0), x2: W, y2: y(0),
        stroke: "#ff6b6b", "stroke-width": 1, "stroke-dasharray": "2 4", opacity: 0.6,
      }));
    }

    // ----- month ticks on x axis -----
    let lastMonth = "";
    for (let i = 0; i < n; i++) {
      const iso = series.dates[i];
      const mk = iso.slice(0, 7);
      if (mk !== lastMonth) {
        lastMonth = mk;
        svg.appendChild(e("line", {
          x1: x(i), y1: padTop, x2: x(i), y2: H - padBottom,
          stroke: "#222631", "stroke-width": 1,
        }));
        const label = e("text", {
          x: x(i) + 4, y: H - padBottom + 16,
          fill: "#8b93a1", "font-size": 11,
        });
        label.textContent = monthLabel(iso, lang);
        svg.appendChild(label);
      }
    }

    // Build point lists for confirmed and optimistic lines.
    const topPts = [], botPts = [];
    for (let i = 0; i < n; i++) {
      topPts.push(`${x(i)},${y(series.optimistic[i])}`);
      botPts.push(`${x(i)},${y(series.confirmed[i])}`);
    }

    // Baseline for the filled area (bottom of the plot, so the whole region
    // under the curve is filled — the "mountain" look from the sketch).
    const baseY = H - padBottom;

    // ----- POTENTIAL band: lighter-opacity fill between confirmed and optimistic -----
    // (guaranteed ≤ potential, so this is the upside sitting above the solid area)
    const bandPath = "M" + topPts.join(" L") + " L" + botPts.slice().reverse().join(" L") + " Z";
    svg.appendChild(e("path", { d: bandPath, fill: "#5b8cff", opacity: 0.22 }));

    // ----- GUARANTEED area: solid fill from baseline up to the confirmed line -----
    const areaPath = "M" + `${x(0)},${baseY} L` + botPts.join(" L") + ` L${x(n - 1)},${baseY} Z`;
    svg.appendChild(e("path", { d: areaPath, fill: "#5b8cff", opacity: 0.6 }));

    // ----- potential line edge (faded) -----
    svg.appendChild(e("polyline", {
      points: topPts.join(" "),
      fill: "none", stroke: "#8fb0ff", "stroke-width": 1.5,
      opacity: 0.5,
    }));

    // ----- guaranteed line edge (crisp) -----
    svg.appendChild(e("polyline", {
      points: botPts.join(" "),
      fill: "none", stroke: "#cdd9ff", "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }));

    // ----- today marker (index 0) -----
    svg.appendChild(e("line", {
      x1: x(0), y1: padTop, x2: x(0), y2: H - padBottom,
      stroke: "#e6e8ec", "stroke-width": 1.5, opacity: 0.5,
    }));

    // ----- event dots -----
    const colorFor = {
      income: "#39d98a", expected: "#5b8cff", fixcost: "#ff6b6b",
      paylater: "#ffb020", purchase: "#ff6b6b",
    };
    series.events.forEach((ev) => {
      const i = ev.dateIndex;
      const isOpt = ev.type === "expected";
      const cy = y(isOpt ? series.optimistic[i] : series.confirmed[i]);
      const dot = e("circle", {
        cx: x(i), cy: cy, r: 3.5,
        fill: colorFor[ev.type] || "#8b93a1",
        opacity: isOpt ? 0.55 : 1,
        class: "event-dot",
      });
      const title = e("title");
      title.textContent = `${fmtDate(series.dates[i])} · ${ev.label} · ${ev.amount >= 0 ? "+" : ""}${fmtMoney(ev.amount)}`;
      dot.appendChild(title);
      svg.appendChild(dot);
    });

    // scroll wrapper
    const scroller = e2div("timeline-scroll");
    scroller.appendChild(svg);
    container.appendChild(scroller);

    // y-axis overlay (fixed, non-scrolling) with value labels
    const yOverlay = e2div("timeline-yaxis");
    for (let t = yTicks; t >= 0; t--) {
      const val = lo + (hi - lo) * (t / yTicks);
      const lab = document.createElement("div");
      lab.className = "y-tick";
      lab.style.top = (y(val) - 7) + "px";
      lab.textContent = shortMoney(val, fmtMoney);
      yOverlay.appendChild(lab);
    }
    container.appendChild(yOverlay);

    return { svg, scroller };
  }

  function e2div(cls) {
    const d = document.createElement("div");
    d.className = cls;
    return d;
  }

  function monthLabel(iso, lang) {
    const d = new Date(iso + "T00:00:00");
    const locale = lang === "zh" ? "zh-CN" : "en-US";
    // Jan shows year
    if (d.getMonth() === 0) {
      return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
    }
    return d.toLocaleDateString(locale, { month: "short" });
  }

  function shortMoney(v, fmtMoney) {
    const abs = Math.abs(v);
    if (abs >= 1000) {
      const k = v / 1000;
      return (k % 1 === 0 ? k : k.toFixed(1)) + "k";
    }
    return Math.round(v).toString();
  }

  window.Chart = { render };
})();
