// Offline persistence via localStorage. All data stays on the device.
(function () {
  const KEY = "finance-tracker:v2";

  // Currencies. EUR is the base everything converts to for the combined graph.
  const CURRENCIES = ["EUR", "USD", "CNY"];
  const SYMBOLS = { EUR: "€", USD: "$", CNY: "¥" };

  const THEMES = ["luxury", "midnight", "graphite", "sand", "mist"];

  const DEFAULT_STATE = {
    lang: "en",
    theme: "luxury",
    baseCurrency: "EUR",
    seeded: false,
    // Manual, editable exchange rates INTO the base (EUR). rates[X] = EUR per 1 X.
    // Purely visual, so a ~1/8-value currency doesn't distort the combined graph.
    rates: { EUR: 1, USD: 0.92, CNY: 0.13 },
    accounts: [],     // { id, name, balance, currency }
    categories: [],   // string[]  (editable)
    // Combined income/expense items:
    // { id, name, amount, currency, kind:"income"|"expense", date, category,
    //   recurring:bool, potential:bool, payLater:bool, included:bool }
    items: [],
    // Goals with per-currency split targets:
    // { id, name, splits:{EUR,USD,CNY}, date, bought:bool, included:bool }
    goals: [],
  };

  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const merged = Object.assign(structuredClone(DEFAULT_STATE), parsed);
      // Sanitize: any field that should be an array must be one, or we reset it.
      ["accounts", "categories", "items", "goals"].forEach((k) => {
        if (!Array.isArray(merged[k])) merged[k] = [];
      });
      // Rates must be an object with the three keys (fall back to defaults).
      if (!merged.rates || typeof merged.rates !== "object") merged.rates = { EUR: 1, USD: 0.92, CNY: 0.13 };
      CURRENCIES.forEach((c) => { if (typeof merged.rates[c] !== "number") merged.rates[c] = DEFAULT_STATE.rates[c]; });
      merged.rates.EUR = 1;
      // Items default to EUR if currency missing.
      merged.items.forEach((it) => { if (!CURRENCIES.includes(it.currency)) it.currency = "EUR"; });
      // Migrate old goals (single `target`) → per-currency splits.
      merged.goals.forEach((g) => {
        if (!g.splits || typeof g.splits !== "object") {
          g.splits = { EUR: num(g.target) || 0, USD: 0, CNY: 0 };
        }
        CURRENCIES.forEach((c) => { if (typeof g.splits[c] !== "number") g.splits[c] = 0; });
      });
      return merged;
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
      id: uid(), currency: "EUR", recurring: false, potential: false, payLater: false, included: true, category: "Other",
    }, o);

    s.items = [
      // Recurring income (mixed currencies)
      mk({ name: "SAP salary", amount: 2200, currency: "EUR", kind: "income", date: isoAddDays(7), category: "Salary", recurring: true }),
      mk({ name: "Raku side gig", amount: 500, currency: "USD", kind: "income", date: isoAddDays(3), category: "Side gig", recurring: true }),
      mk({ name: "Dad support", amount: 300, currency: "EUR", kind: "income", date: isoAddDays(1), category: "Support", recurring: true }),
      mk({ name: "Tutoring (China)", amount: 3000, currency: "CNY", kind: "income", date: isoAddDays(9), category: "Side gig", recurring: true }),
      // Potential income
      mk({ name: "Dynasty bonus", amount: 800, currency: "EUR", kind: "income", date: isoAddDays(40), category: "Salary", potential: true }),
      mk({ name: "Tax return", amount: 1300, currency: "EUR", kind: "income", date: isoAddDays(160), category: "Other", potential: true }),
      // Recurring expenses
      mk({ name: "Rent", amount: 1100, currency: "EUR", kind: "expense", date: isoAddDays(2), category: "Rent", recurring: true }),
      mk({ name: "Groceries", amount: 400, currency: "EUR", kind: "expense", date: isoAddDays(5), category: "Groceries", recurring: true }),
      mk({ name: "Health insurance", amount: 180, currency: "EUR", kind: "expense", date: isoAddDays(4), category: "Insurance", recurring: true }),
      mk({ name: "Phone + internet", amount: 60, currency: "EUR", kind: "expense", date: isoAddDays(10), category: "Bills", recurring: true }),
      mk({ name: "WeChat subscriptions", amount: 120, currency: "CNY", kind: "expense", date: isoAddDays(8), category: "Subscriptions", recurring: true }),
      // One-time expenses (big dips)
      mk({ name: "MacBook Pro", amount: 2400, currency: "USD", kind: "expense", date: isoAddDays(45), category: "Tech" }),
      mk({ name: "Sofa (pay later)", amount: 1500, currency: "EUR", kind: "expense", date: isoAddDays(20), category: "Shopping", payLater: true }),
      mk({ name: "Flights to Japan", amount: 320, currency: "EUR", kind: "expense", date: isoAddDays(120), category: "Travel" }),
    ];

    const goal = (name, days, splits) => ({ id: uid(), name, splits: Object.assign({ EUR: 0, USD: 0, CNY: 0 }, splits), date: isoAddDays(days), bought: false, included: true });
    s.goals = [
      goal("Trip to Japan", 300, { EUR: 1000, USD: 500, CNY: 5000 }), // split across all three
      goal("New phone", 60, { EUR: 1200 }),
      goal("New sofa", 210, { EUR: 1500 }),
    ];
    return s;
  }

  window.Store = { load, save, uid, seed, isoAddDays, num, DEFAULT_STATE, CURRENCIES, SYMBOLS, THEMES };
})();
