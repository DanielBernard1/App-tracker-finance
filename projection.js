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

  const CURRENCIES = ["EUR", "USD", "CNY"];
  const PAY_LATER_DAYS = 30;

  // Produce a projection with PER-CURRENCY native series plus an EUR-equivalent
  // combined series.
  //
  // Returns {
  //   dates, horizonDays, start,
  //   byCur: { EUR:{confirmed,optimistic,start}, USD:{...}, CNY:{...} },  // native units
  //   combined: { confirmed, optimistic, startingBalance },               // EUR-equivalent
  //   events,          // each has .currency and .amount (native)
  //   markers,         // goal markers with per-currency fulfillment
  //   rates
  // }
  function project(state, opts) {
    opts = opts || {};
    const horizonDays = opts.horizonDays || 730;
    const start = opts.startISO || todayISO();
    const rates = Object.assign({ EUR: 1, USD: 0.92, CNY: 0.13 }, state.rates || {});
    rates.EUR = 1;

    // Per-currency delta arrays.
    const cDelta = {}, oDelta = {}, startBal = {};
    CURRENCIES.forEach((c) => {
      cDelta[c] = new Array(horizonDays + 1).fill(0);
      oDelta[c] = new Array(horizonDays + 1).fill(0);
      startBal[c] = 0;
    });

    // Starting balances by currency (from accounts).
    (state.accounts || []).forEach((a) => {
      const cur = CURRENCIES.includes(a.currency) ? a.currency : "EUR";
      startBal[cur] += num(a.balance);
    });

    const events = [];

    function applyOn(cur, dateISO, amount, potential, meta) {
      const idx = daysBetween(start, dateISO);
      if (idx < 0 || idx > horizonDays) return;
      if (potential) {
        oDelta[cur][idx] += amount;
      } else {
        cDelta[cur][idx] += amount;
        oDelta[cur][idx] += amount;
      }
      if (meta) events.push(Object.assign({ dateIndex: idx, amount, currency: cur }, meta));
    }

    (state.items || []).forEach((it) => {
      if (it.included === false) return;
      const cur = CURRENCIES.includes(it.currency) ? it.currency : "EUR";
      const signed = (it.kind === "expense" ? -1 : 1) * num(it.amount);
      const type = it.kind === "expense" ? "expense" : (it.potential ? "expected" : "income");
      const payLater = !!it.payLater && it.kind === "expense";
      const shift = (dateISO) => payLater ? isoAddDays(dateISO, PAY_LATER_DAYS) : dateISO;
      const meta = { type, label: it.name, category: it.category, payLater };
      if (it.recurring) {
        monthlyDates(it.date || start, start, horizonDays + PAY_LATER_DAYS).forEach((d) => {
          applyOn(cur, shift(d), signed, !!it.potential, meta);
        });
      } else {
        applyOn(cur, shift(it.date || start), signed, !!it.potential, meta);
      }
    });

    // Bought goals = per-currency expense dips at the goal's date.
    (state.goals || []).forEach((g) => {
      if (g.bought && g.included !== false) {
        const splits = g.splits || {};
        CURRENCIES.forEach((c) => {
          const amt = num(splits[c]);
          if (amt > 0) applyOn(c, g.date || start, -amt, false, { type: "goalbought", label: g.name });
        });
      }
    });

    // Accumulate per-currency running balances (native units).
    const dates = [];
    const byCur = {};
    CURRENCIES.forEach((c) => { byCur[c] = { confirmed: [], optimistic: [], start: startBal[c] }; });
    const run = {}; CURRENCIES.forEach((c) => { run[c] = { c: startBal[c], o: startBal[c] }; });

    for (let i = 0; i <= horizonDays; i++) {
      dates.push(isoAddDays(start, i));
      CURRENCIES.forEach((c) => {
        run[c].c += cDelta[c][i];
        run[c].o += oDelta[c][i];
        byCur[c].confirmed.push(Math.round(run[c].c * 100) / 100);
        byCur[c].optimistic.push(Math.round(run[c].o * 100) / 100);
      });
    }

    // Combined EUR-equivalent series = rate-weighted sum across currencies.
    const combined = { confirmed: [], optimistic: [], startingBalance: 0 };
    CURRENCIES.forEach((c) => { combined.startingBalance += startBal[c] * rates[c]; });
    combined.startingBalance = Math.round(combined.startingBalance * 100) / 100;
    for (let i = 0; i <= horizonDays; i++) {
      let cc = 0, oo = 0;
      CURRENCIES.forEach((c) => { cc += byCur[c].confirmed[i] * rates[c]; oo += byCur[c].optimistic[i] * rates[c]; });
      combined.confirmed.push(Math.round(cc * 100) / 100);
      combined.optimistic.push(Math.round(oo * 100) / 100);
    }

    // Goal markers: per-currency fulfillment at the goal's date.
    const markers = [];
    (state.goals || []).forEach((g) => {
      if (g.included === false || !g.date) return;
      const idx = daysBetween(start, g.date);
      if (idx < 0 || idx > horizonDays) return;
      const splits = g.splits || {};
      const perCur = {};
      let targetEUR = 0, towardEUR = 0;
      CURRENCIES.forEach((c) => {
        const target = num(splits[c]);
        if (target <= 0) return;
        const bal = byCur[c].confirmed[idx];
        const toward = Math.max(0, bal);
        perCur[c] = {
          target, balance: bal,
          toward: Math.min(toward, target),
          pct: Math.min(100, Math.round((Math.max(0, bal) / target) * 100)),
        };
        targetEUR += target * rates[c];
        towardEUR += Math.min(Math.max(0, bal), target) * rates[c];
      });
      const pct = targetEUR > 0 ? Math.min(100, Math.round((towardEUR / targetEUR) * 100)) : 0;
      markers.push({ dateIndex: idx, name: g.name, perCur, targetEUR, towardEUR, pct, bought: !!g.bought });
    });

    return { dates, horizonDays, start, byCur, combined, events, markers, rates, currencies: CURRENCIES };
  }

  window.Projection = { project, todayISO, isoAddDays, daysBetween, CURRENCIES };
})();
