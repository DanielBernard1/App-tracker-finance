// Offline persistence via localStorage. All data stays on the device.
(function () {
  const KEY = "finance-tracker:v1";

  const DEFAULT_STATE = {
    lang: "en",
    baseCurrency: "EUR",
    seeded: false,
    accounts: [],        // { id, name, balance, currency }
    incomeStreams: [],   // { id, name, amount, currency, payDay, note }
    expectedIncome: [],  // { id, name, amount, currency, date, note }
    goals: [],           // { id, name, target, saved, currency, deadline, note }
    fixCosts: [],        // { id, name, amount, currency, dueDay, note }
    payLater: [],        // { id, name, amount, currency, dueDate, paid, note }
    purchases: [],       // { id, name, amount, currency, category, date, note }
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULT_STATE), parsed);
    } catch (e) {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("save failed", e);
    }
  }

  function uid() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  }

  function isoAddDays(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  // Reasonable demo data so the timeline shows functionality immediately.
  function seed() {
    const s = structuredClone(DEFAULT_STATE);
    s.seeded = true;
    s.accounts = [
      { id: uid(), name: "Main (bank)", balance: 2400, currency: "EUR" },
      { id: uid(), name: "Revolut", balance: 650, currency: "USD" },
      { id: uid(), name: "Cash", balance: 150, currency: "EUR" },
    ];
    s.incomeStreams = [
      { id: uid(), name: "SAP", amount: 2200, currency: "EUR", payDay: 28, note: "Salary" },
      { id: uid(), name: "Raku", amount: 450, currency: "EUR", payDay: 15, note: "Side gig" },
      { id: uid(), name: "Dad", amount: 300, currency: "EUR", payDay: 1, note: "Support" },
    ];
    s.expectedIncome = [
      { id: uid(), name: "Dynasty bonus", amount: 800, currency: "EUR", date: isoAddDays(40), note: "If project ships" },
      { id: uid(), name: "Candella refund", amount: 220, currency: "USD", date: isoAddDays(75), note: "Expected" },
    ];
    s.fixCosts = [
      { id: uid(), name: "Rent", amount: 1100, currency: "EUR", dueDay: 1, note: "" },
      { id: uid(), name: "Groceries", amount: 400, currency: "EUR", dueDay: 5, note: "Avg" },
      { id: uid(), name: "Phone + internet", amount: 60, currency: "EUR", dueDay: 10, note: "" },
      { id: uid(), name: "Gym", amount: 35, currency: "EUR", dueDay: 12, note: "" },
    ];
    s.payLater = [
      { id: uid(), name: "Laptop (Klarna)", amount: 900, currency: "EUR", dueDate: isoAddDays(55), paid: false, note: "3rd installment" },
      { id: uid(), name: "Flights", amount: 320, currency: "EUR", dueDate: isoAddDays(120), paid: false, note: "" },
    ];
    s.goals = [
      { id: uid(), name: "Trip to Japan", target: 3000, saved: 600, currency: "EUR", deadline: isoAddDays(300), note: "" },
    ];
    s.purchases = [
      { id: uid(), name: "Groceries", amount: 62.4, currency: "EUR", category: "Food", date: isoAddDays(-2), note: "" },
      { id: uid(), name: "Coffee", amount: 4.2, currency: "EUR", category: "Food", date: isoAddDays(-1), note: "" },
    ];
    return s;
  }

  window.Store = { load, save, uid, seed, DEFAULT_STATE };
})();
