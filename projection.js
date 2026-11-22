// Cash-flow projection engine (v2 model).
//
// Series produced over a daily horizon:
//   confirmed  = starting balance + all INCLUDED, non-potential items
//                (income +, expense −) + bought goals as expense dips
//   optimistic = confirmed + INCLUDED potential income
//
// Items may be one-time (apply once on `date`) or recurring (repeat monthly
// from `date` across the horizon, same day-of-month).
(function () {
  "use strict";

  const DAY_MS = 86400000;

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  function isoAddDays(startISO, n) {
    const d = new Date(startISO + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(aISO, bISO) {
    const a = new Date(aISO + "T00:00:00");
    const b = new Date(bISO + "T00:00:00");
    return Math.round((b - a) / DAY_MS);
  }

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // Monthly recurrence dates (ISO) on/after startDate, clamped to month length,
  // within [start, start+horizon].
  function monthlyDates(firstISO, startISO, horizonDays) {
    const out = [];
    const first = new Date(firstISO + "T00:00:00");
    const start = new Date(startISO + "T00:00:00");
    const end = new Date(isoAddDays(startISO, horizonDays) + "T00:00:00");
    const dom = first.getDate();
    // begin at the item's own month, iterate forward
    let y = first.getFullYear();
    let m = first.getMonth();
    for (let i = 0; i < horizonDays / 28 + 4; i++) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const occ = new Date(y, m, Math.min(dom, lastDay));
      if (occ >= start && occ <= end) out.push(occ.toISOString().slice(0, 10));
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return out;
  }

  // Returns { dates, confirmed, optimistic, events, markers, startingBalance, horizonDays, start }
  function project(state, opts) {
    opts = opts || {};
    const horizonDays = opts.horizonDays || 730;
    const start = opts.startISO || todayISO();

    const startingBalance = (state.accounts || []).reduce((s, a) => s + num(a.balance), 0);

    const confirmedDelta = new Array(horizonDays + 1).fill(0);
    const optimisticDelta = new Array(horizonDays + 1).fill(0);
    const events = [];

    function applyOn(dateISO, amount, potential, meta) {
      const idx = daysBetween(start, dateISO);
      if (idx < 0 || idx > horizonDays) return;
      if (potential) {
        optimisticDelta[idx] += amount; // potential income only lifts the optimistic line
      } else {
        confirmedDelta[idx] += amount;
        optimisticDelta[idx] += amount; // confirmed also flows into optimistic
      }
      if (meta) events.push(Object.assign({ dateIndex: idx, amount }, meta));
    }

    const PAY_LATER_DAYS = 30;
    (state.items || []).forEach((it) => {
      if (it.included === false) return;
      const signed = (it.kind === "expense" ? -1 : 1) * num(it.amount);
      const type = it.kind === "expense" ? "expense" : (it.potential ? "expected" : "income");
      // Pay-later only applies to expenses: the money leaves 30 days after the date.
      const payLater = !!it.payLater && it.kind === "expense";
      const shift = (dateISO) => payLater ? isoAddDays(dateISO, PAY_LATER_DAYS) : dateISO;
      const meta = { type, label: it.name, category: it.category, payLater };
      if (it.recurring) {
        // Each monthly occurrence is computed on the item's own date, then shifted.
        monthlyDates(it.date || start, start, horizonDays + PAY_LATER_DAYS).forEach((d) => {
          applyOn(shift(d), signed, !!it.potential, meta);
        });
      } else {
        applyOn(shift(it.date || start), signed, !!it.potential, meta);
      }
    });

    // Bought goals = one-time expense dip at the goal's date.
    (state.goals || []).forEach((g) => {
      if (g.bought && g.included !== false) {
        applyOn(g.date || start, -num(g.target), false, { type: "goalbought", label: g.name });
      }
    });

    // Accumulate running balances.
    const dates = [], confirmed = [], optimistic = [];
    let c = startingBalance, o = startingBalance;
    for (let i = 0; i <= horizonDays; i++) {
      c += confirmedDelta[i];
      o += optimisticDelta[i];
      dates.push(isoAddDays(start, i));
      confirmed.push(Math.round(c * 100) / 100);
      optimistic.push(Math.round(o * 100) / 100);
    }

    // Goal markers: position + fulfillment (balance at that date / target).
    const markers = [];
    (state.goals || []).forEach((g) => {
      if (g.included === false) return;
      if (!g.date) return;
      const idx = daysBetween(start, g.date);
      if (idx < 0 || idx > horizonDays) return;
      const balance = confirmed[idx];
      const target = num(g.target);
      const toward = Math.max(0, balance); // money available toward the goal
      const pct = target > 0 ? Math.min(100, Math.round((toward / target) * 100)) : 0;
      markers.push({
        dateIndex: idx, name: g.name, target,
        balance, toward, pct, bought: !!g.bought,
      });
    });

    return { dates, confirmed, optimistic, events, markers, startingBalance, horizonDays, start };
  }

  window.Projection = { project, todayISO, isoAddDays, daysBetween };
})();
