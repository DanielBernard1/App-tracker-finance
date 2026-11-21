// Cash-flow projection engine.
// Produces a per-day series of projected running balance over a horizon.
//
// Two series are produced:
//   confirmed  = starting balance + income streams + expected-is-NOT-included
//                - fix costs - pay-later (on due date)
//   optimistic = confirmed + expected/potential income (on their dates)
//
// Recurring items (income streams, fix costs) repeat monthly from `today`
// on the same day-of-month.
(function () {
  "use strict";

  const DAY_MS = 86400000;

  function isoAddDays(startISO, n) {
    const d = new Date(startISO + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
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

  // Build list of monthly occurrence dates (ISO) for a recurring item,
  // starting at the first month boundary on/after `startISO`, within horizon.
  function monthlyDates(startISO, horizonDays, dayOfMonth) {
    const dates = [];
    const start = new Date(startISO + "T00:00:00");
    const end = new Date(isoAddDays(startISO, horizonDays) + "T00:00:00");
    // iterate month by month
    let y = start.getFullYear();
    let m = start.getMonth();
    for (let i = 0; i < horizonDays / 28 + 2; i++) {
      // clamp day-of-month to month length
      const lastDay = new Date(y, m + 1, 0).getDate();
      const dom = Math.min(dayOfMonth, lastDay);
      const occ = new Date(y, m, dom);
      if (occ >= start && occ <= end) {
        dates.push(occ.toISOString().slice(0, 10));
      }
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return dates;
  }

  // Returns { dates:[iso...], confirmed:[num...], optimistic:[num...],
  //           events:[{dateIndex, type, label, amount}] }
  function project(state, opts) {
    opts = opts || {};
    const horizonDays = opts.horizonDays || 730; // ~2 years
    const start = opts.startISO || todayISO();

    const startingBalance = (state.accounts || []).reduce((s, a) => s + num(a.balance), 0);

    // deltas[dayIndex] = { confirmed: +/-, optimistic: +/- } applied on that day
    const confirmedDelta = new Array(horizonDays + 1).fill(0);
    const optimisticDelta = new Array(horizonDays + 1).fill(0);
    const events = [];

    function addDelta(dateISO, amount, bucket, meta) {
      const idx = daysBetween(start, dateISO);
      if (idx < 0 || idx > horizonDays) return;
      if (bucket === "confirmed") {
        confirmedDelta[idx] += amount;
        optimisticDelta[idx] += amount; // confirmed also affects optimistic
      } else {
        optimisticDelta[idx] += amount; // optimistic-only (expected income)
      }
      if (meta) events.push(Object.assign({ dateIndex: idx, amount: amount }, meta));
    }

    const dom = (iso) => new Date(iso + "T00:00:00").getDate();

    // Recurring income streams (monthly, same day-of-month as today)
    const payday = dom(start);
    (state.incomeStreams || []).forEach((s) => {
      monthlyDates(start, horizonDays, s.payDay ? num(s.payDay) : payday).forEach((d) => {
        addDelta(d, num(s.amount), "confirmed", { type: "income", label: s.name });
      });
    });

    // Recurring fix costs (monthly)
    (state.fixCosts || []).forEach((f) => {
      monthlyDates(start, horizonDays, f.dueDay ? num(f.dueDay) : 1).forEach((d) => {
        addDelta(d, -num(f.amount), "confirmed", { type: "fixcost", label: f.name });
      });
    });

    // Pay later: one-time dip on due date (unpaid only)
    (state.payLater || []).forEach((p) => {
      if (p.paid) return;
      if (!p.dueDate) return;
      addDelta(p.dueDate, -num(p.amount), "confirmed", { type: "paylater", label: p.name });
    });

    // Purchases already logged in the future? treat as one-time dips on their date
    (state.purchases || []).forEach((pu) => {
      if (!pu.date) return;
      if (daysBetween(start, pu.date) <= 0) return; // past/today purchases don't affect future projection
      addDelta(pu.date, -num(pu.amount), "confirmed", { type: "purchase", label: pu.name });
    });

    // Expected / potential income: optimistic-only
    (state.expectedIncome || []).forEach((e) => {
      const d = e.date || start;
      addDelta(d, num(e.amount), "optimistic", { type: "expected", label: e.name });
    });

    // Accumulate into running balances
    const dates = [];
    const confirmed = [];
    const optimistic = [];
    let cRun = startingBalance;
    let oRun = startingBalance;
    for (let i = 0; i <= horizonDays; i++) {
      cRun += confirmedDelta[i];
      oRun += optimisticDelta[i];
      dates.push(isoAddDays(start, i));
      confirmed.push(Math.round(cRun * 100) / 100);
      optimistic.push(Math.round(oRun * 100) / 100);
    }

    return { dates, confirmed, optimistic, events, startingBalance, horizonDays, start };
  }

  window.Projection = { project, todayISO, isoAddDays, daysBetween };
})();
