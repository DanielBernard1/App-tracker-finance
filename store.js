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
    // Recurring income streams (monthly) — varied pay days across the month.
    s.incomeStreams = [
      { id: uid(), name: "SAP", amount: 2200, currency: "EUR", payDay: 28, note: "Salary" },
      { id: uid(), name: "Raku", amount: 450, currency: "EUR", payDay: 15, note: "Side gig" },
      { id: uid(), name: "Dad", amount: 300, currency: "EUR", payDay: 1, note: "Monthly support" },
      { id: uid(), name: "Dynasty (retainer)", amount: 500, currency: "USD", payDay: 20, note: "Revolut USD" },
      { id: uid(), name: "Rental income", amount: 350, currency: "EUR", payDay: 5, note: "Sublet room" },
    ];
    // Potential / expected income (faded band above the confirmed line).
    s.expectedIncome = [
      { id: uid(), name: "Dynasty bonus", amount: 800, currency: "EUR", date: isoAddDays(40), note: "If project ships" },
      { id: uid(), name: "Candella refund", amount: 220, currency: "USD", date: isoAddDays(75), note: "Expected" },
      { id: uid(), name: "Tax return", amount: 1300, currency: "EUR", date: isoAddDays(160), note: "Estimated" },
      { id: uid(), name: "Freelance gig", amount: 2000, currency: "EUR", date: isoAddDays(260), note: "If signed" },
    ];
    // Recurring fix costs (monthly) — mix of large and small, different due days.
    s.fixCosts = [
      { id: uid(), name: "Rent", amount: 1100, currency: "EUR", dueDay: 1, note: "" },
      { id: uid(), name: "Groceries", amount: 400, currency: "EUR", dueDay: 5, note: "Avg/month" },
      { id: uid(), name: "Health insurance", amount: 180, currency: "EUR", dueDay: 3, note: "" },
      { id: uid(), name: "Phone + internet", amount: 60, currency: "EUR", dueDay: 10, note: "" },
      { id: uid(), name: "Streaming", amount: 25, currency: "EUR", dueDay: 8, note: "Netflix + Spotify" },
      { id: uid(), name: "Gym", amount: 35, currency: "EUR", dueDay: 12, note: "" },
      { id: uid(), name: "Car loan", amount: 240, currency: "EUR", dueDay: 18, note: "" },
    ];
    // Pay later — one-time dips: near-term, far-term, a big one, a USD one, and one already paid.
    s.payLater = [
      { id: uid(), name: "Laptop (Klarna)", amount: 900, currency: "EUR", dueDate: isoAddDays(25), paid: false, note: "Final installment" },
      { id: uid(), name: "Flights to Japan", amount: 320, currency: "EUR", dueDate: isoAddDays(120), paid: false, note: "" },
      { id: uid(), name: "New sofa (0% finance)", amount: 1500, currency: "EUR", dueDate: isoAddDays(210), paid: false, note: "Big item" },
      { id: uid(), name: "Revolut gadget", amount: 480, currency: "USD", dueDate: isoAddDays(70), paid: false, note: "USD BNPL" },
      { id: uid(), name: "Headphones (paid)", amount: 180, currency: "EUR", dueDate: isoAddDays(-10), paid: true, note: "Already paid" },
    ];
    // Goals in different states: in-progress, nearly done, reached, no deadline.
    s.goals = [
      { id: uid(), name: "Trip to Japan", target: 3000, saved: 600, currency: "EUR", deadline: isoAddDays(300), note: "Flights + hotel" },
      { id: uid(), name: "New phone", target: 1200, saved: 1050, currency: "EUR", deadline: isoAddDays(60), note: "Almost there" },
      { id: uid(), name: "Emergency fund", target: 5000, saved: 5000, currency: "EUR", deadline: isoAddDays(400), note: "Reached!" },
      { id: uid(), name: "Rainy-day savings", target: 2000, saved: 300, currency: "EUR", deadline: "", note: "No deadline" },
    ];
    // Purchase history — past entries (history/total) + BIG future one-time purchases
    // that show up as sharp dips on the timeline.
    s.purchases = [
      // past (feed History + total expenses, don't affect future projection)
      { id: uid(), name: "Groceries", amount: 62.4, currency: "EUR", category: "Food", date: isoAddDays(-5), note: "" },
      { id: uid(), name: "Dinner out", amount: 48, currency: "EUR", category: "Food", date: isoAddDays(-3), note: "" },
      { id: uid(), name: "Coffee", amount: 4.2, currency: "EUR", category: "Food", date: isoAddDays(-1), note: "" },
      { id: uid(), name: "Pharmacy", amount: 23.9, currency: "EUR", category: "Health", date: isoAddDays(-2), note: "" },
      // upcoming BIG one-time purchases → sharp dips on the timeline
      { id: uid(), name: "Used car", amount: 6500, currency: "EUR", category: "Transport", date: isoAddDays(95), note: "Big purchase" },
      { id: uid(), name: "MacBook Pro", amount: 2400, currency: "EUR", category: "Tech", date: isoAddDays(45), note: "Big purchase" },
      { id: uid(), name: "Dentist (implant)", amount: 1800, currency: "EUR", category: "Health", date: isoAddDays(140), note: "Planned" },
      { id: uid(), name: "Watch", amount: 1200, currency: "USD", category: "Shopping", date: isoAddDays(185), note: "Revolut USD" },
    ];
    return s;
  }

  window.Store = { load, save, uid, seed, DEFAULT_STATE };
})();
