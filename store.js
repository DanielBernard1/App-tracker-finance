// Offline persistence via localStorage. All data stays on the device.
(function () {
  const KEY = "finance-tracker:v2";

  const DEFAULT_STATE = {
    lang: "en",
    baseCurrency: "EUR",
    seeded: false,
    accounts: [],     // { id, name, balance, currency }
    categories: [],   // string[]  (editable)
    // Combined income/expense items:
    // { id, name, amount, kind:"income"|"expense", date, category,
    //   recurring:bool, potential:bool, included:bool }
    items: [],
    // Goals:
    // { id, name, target, date, bought:bool, included:bool }
    goals: [],
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
    s.categories = [
      "Salary", "Side gig", "Support", "Rent", "Groceries", "Insurance",
      "Bills", "Subscriptions", "Transport", "Tech", "Health", "Shopping",
      "Travel", "Other",
    ];
    const mk = (o) => Object.assign({
      id: uid(), recurring: false, potential: false, included: true, category: "Other",
    }, o);

    s.items = [
      // Recurring income
      mk({ name: "SAP salary", amount: 2200, kind: "income", date: isoAddDays(7), category: "Salary", recurring: true }),
      mk({ name: "Raku side gig", amount: 450, kind: "income", date: isoAddDays(3), category: "Side gig", recurring: true }),
      mk({ name: "Dad support", amount: 300, kind: "income", date: isoAddDays(1), category: "Support", recurring: true }),
      // Potential income (recurring off, potential on)
      mk({ name: "Dynasty bonus", amount: 800, kind: "income", date: isoAddDays(40), category: "Salary", potential: true }),
      mk({ name: "Tax return", amount: 1300, kind: "income", date: isoAddDays(160), category: "Other", potential: true }),
      // Recurring expenses
      mk({ name: "Rent", amount: 1100, kind: "expense", date: isoAddDays(2), category: "Rent", recurring: true }),
      mk({ name: "Groceries", amount: 400, kind: "expense", date: isoAddDays(5), category: "Groceries", recurring: true }),
      mk({ name: "Health insurance", amount: 180, kind: "expense", date: isoAddDays(4), category: "Insurance", recurring: true }),
      mk({ name: "Phone + internet", amount: 60, kind: "expense", date: isoAddDays(10), category: "Bills", recurring: true }),
      mk({ name: "Gym", amount: 35, kind: "expense", date: isoAddDays(12), category: "Subscriptions", recurring: true }),
      // One-time expenses (big dips)
      mk({ name: "MacBook Pro", amount: 2400, kind: "expense", date: isoAddDays(45), category: "Tech" }),
      mk({ name: "Used car", amount: 6500, kind: "expense", date: isoAddDays(95), category: "Transport" }),
      mk({ name: "Flights to Japan", amount: 320, kind: "expense", date: isoAddDays(120), category: "Travel" }),
    ];

    s.goals = [
      { id: uid(), name: "Trip to Japan", target: 3000, date: isoAddDays(300), bought: false, included: true },
      { id: uid(), name: "New phone", target: 1200, date: isoAddDays(60), bought: false, included: true },
      { id: uid(), name: "New sofa", target: 1500, date: isoAddDays(210), bought: false, included: true },
    ];
    return s;
  }

  window.Store = { load, save, uid, seed, isoAddDays, DEFAULT_STATE };
})();
