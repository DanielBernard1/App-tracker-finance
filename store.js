// Offline persistence via localStorage. All data stays on the device.
(function () {
  const KEY = "finance-tracker:v1";

  const DEFAULT_STATE = {
    lang: "en",
    baseCurrency: "EUR",
    incomeStreams: [],   // { id, name, amount, currency, note }
    expectedIncome: [],  // { id, name, amount, currency, date, note }
    goals: [],           // { id, name, target, saved, currency, deadline, note }
    fixCosts: [],        // { id, name, amount, currency, note }
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

  window.Store = { load, save, uid, DEFAULT_STATE };
})();
