// Real behavioral test: loads the actual app JS into a faithful DOM harness,
// renders, simulates user actions, and asserts the graph + columns respond.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeDocument, El } from "./dom-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}

function buildEnv() {
  const document = makeDocument();
  // seed the fixed DOM nodes the HTML provides
  const view = new El("main"); view.setAttribute("id", "view");
  const modalRoot = new El("div"); modalRoot.setAttribute("id", "modal-root");
  const langSel = new El("select"); langSel.setAttribute("id", "lang-select"); langSel.value = "en";
  const settings = new El("button"); settings.setAttribute("id", "settings-btn");
  // data-i18n nodes (tab labels removed; just a couple static ones could exist)
  document.body.appendChild(view);
  document.body.appendChild(modalRoot);
  document.body.appendChild(langSel);
  document.body.appendChild(settings);
  [view, modalRoot, langSel, settings].forEach((n) => document.register(n));
  // document.querySelectorAll scans body
  document.querySelectorAll = (sel) => document.body.querySelectorAll(sel);

  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  // The sandbox object IS the global scope of the VM. We also expose it as
  // `window`, so `window.Store = …` and bare `Store`/`t` both resolve to it.
  const sandbox = {
    document,
    localStorage,
    Intl, Math, Date, JSON, console,
    structuredClone: (o) => JSON.parse(JSON.stringify(o)),
    requestAnimationFrame: (fn) => fn(),  // run chart render synchronously
    // setTimeout is a no-op here (does NOT auto-fire) so deferred resets like the
    // raccoon auto-hide don't run during synchronous assertions.
    setTimeout: () => 0,
    clearTimeout: () => {},
    confirm: () => true,
    parseFloat, parseInt, isNaN,
  };
  sandbox.window = sandbox;   // bare `window` === global scope
  sandbox.globalThis = sandbox;
  // theme support used by app.js init
  sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });
  const ctx = createContext(sandbox);
  return { ctx, sandbox, win: sandbox, document, view, modalRoot, langSel, localStorage, store };
}

function load(ctx, file) {
  const code = readFileSync(join(root, file), "utf8");
  runInContext(code, ctx, { filename: file });
}

function run() {
  const env = buildEnv();
  const { ctx, win, document, view, modalRoot, langSel } = env;

  console.log("Loading app modules…");
  load(ctx, "i18n.js");
  load(ctx, "store.js");
  load(ctx, "projection.js");
  load(ctx, "chart.js");
  load(ctx, "app.js"); // runs render() on load

  // ---- Test 1: app renders chart + both columns ----
  console.log("\nTest 1: initial render");
  const chartCard = view.querySelector(".timeline-card");
  ok("chart card rendered", !!chartCard);
  const cols = view.querySelector(".columns");
  ok("columns container rendered", !!cols);
  const colEls = view.querySelectorAll(".col");
  ok("two columns present", colEls.length === 2, "got " + colEls.length);
  const errorBox = view.querySelectorAll(".empty").filter((e) => /error/i.test(e.textContent));
  ok("no error box shown", errorBox.length === 0, errorBox[0] && errorBox[0].textContent);

  // ---- Test 2: item rows populated from seed ----
  console.log("\nTest 2: item + goal rows");
  const itemRows = view.querySelectorAll(".list-row");
  ok("list rows rendered", itemRows.length > 0, "got " + itemRows.length);
  // count checkboxes
  const checkboxes = view.querySelectorAll('input[type="checkbox"]');
  ok("checkboxes present on rows", checkboxes.length >= 10, "got " + checkboxes.length);

  // ---- Test 3: deselecting an item changes the projection ----
  console.log("\nTest 3: toggle checkbox updates graph");
  const Projection = win.Projection;
  const Store = win.Store;
  // read current state from localStorage
  const stateBefore = JSON.parse(env.store["finance-tracker:v2"]);
  const before = Projection.project(stateBefore, { horizonDays: 730 });
  const endBefore = before.combined.confirmed[730];

  // find the biggest income item and uncheck it via the UI
  const bigIncome = stateBefore.items.filter((i) => i.kind === "income").sort((a, b) => b.amount - a.amount)[0];
  ok("found an income item to toggle", !!bigIncome, bigIncome && bigIncome.name);

  // locate its row by matching the title text, then its checkbox
  let toggled = false;
  view.querySelectorAll(".list-row").forEach((row) => {
    const title = row.querySelector(".row-title");
    if (title && title.textContent.indexOf(bigIncome.name) === 0 && !toggled) {
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) { cb.checked = false; cb.dispatch("change", { target: cb }); toggled = true; }
    }
  });
  ok("toggled the income checkbox via UI", toggled);

  const stateAfter = JSON.parse(env.store["finance-tracker:v2"]);
  const after = Projection.project(stateAfter, { horizonDays: 730 });
  const endAfter = after.combined.confirmed[730];
  ok("graph projection dropped after unchecking income", endAfter < endBefore - 1,
    "before=" + endBefore + " after=" + endAfter);
  const toggledItem = stateAfter.items.find((i) => i.name === bigIncome.name);
  ok("item persisted as excluded", toggledItem && toggledItem.included === false);

  // ---- Test 4: goal markers + fulfillment math ----
  console.log("\nTest 4: goal markers");
  ok("goal markers exist in series", after.markers.length >= 1, "got " + after.markers.length);
  const mk = after.markers[0];
  ok("marker has pct + EUR x/x + per-currency", typeof mk.pct === "number" && typeof mk.towardEUR === "number" && typeof mk.targetEUR === "number" && typeof mk.perCur === "object",
    JSON.stringify(mk));

  // ---- Test 5: 'bought' goal creates an expense dip ----
  console.log("\nTest 5: mark goal bought → dip");
  const g0name = stateAfter.goals[0].name;
  let boughtClicked = false;
  view.querySelectorAll(".col").slice(-1)[0].querySelectorAll(".list-row").forEach((row) => {
    const title = row.querySelector(".row-title");
    if (title && title.textContent.indexOf(g0name) === 0 && !boughtClicked) {
      const btn = row.querySelector(".bought-btn");
      if (btn) { btn.dispatch("click", { target: btn, stopPropagation() {} }); boughtClicked = true; }
    }
  });
  ok("clicked 'bought' on a goal", boughtClicked);
  const stateBought = JSON.parse(env.store["finance-tracker:v2"]);
  const gb = stateBought.goals.find((g) => g.name === g0name);
  ok("goal persisted as bought", gb && gb.bought === true);
  const boughtSeries = Projection.project(stateBought, { horizonDays: 730 });
  const gbEvent = boughtSeries.events.find((e) => e.type === "goalbought" && e.label === g0name);
  ok("bought goal appears as expense event on timeline", !!gbEvent, gbEvent && gbEvent.amount);
  const gIdx = boughtSeries.markers.find((m) => m.name === g0name).dateIndex;
  // Combined EUR-equivalent dip should equal the EUR-equiv of the goal's splits.
  const rates = boughtSeries.rates;
  const splitEUR = Object.keys(gb.splits).reduce((s, c) => s + (gb.splits[c] || 0) * (rates[c] || 0), 0);
  const dip = boughtSeries.combined.confirmed[gIdx - 1] - boughtSeries.combined.confirmed[gIdx];
  ok("combined balance dips by the goal's EUR-equivalent", Math.abs(dip - splitEUR) < 0.5, "dip=" + dip + " splitEUR=" + splitEUR);

  // ---- Test 6: resilience to malformed stored state ----
  console.log("\nTest 6: malformed state does not crash");
  env.store["finance-tracker:v2"] = JSON.stringify({ lang: "en", items: { oops: 1 }, goals: null });
  // reload app fresh in a new env to simulate page load with bad data
  const env2 = buildEnv();
  env2.store["finance-tracker:v2"] = env.store["finance-tracker:v2"];
  let threw = false;
  try {
    load(env2.ctx, "i18n.js"); load(env2.ctx, "store.js"); load(env2.ctx, "projection.js");
    load(env2.ctx, "chart.js"); load(env2.ctx, "app.js");
  } catch (e) { threw = true; console.log("    threw:", e.message); }
  ok("app loads with malformed state without throwing", !threw);
  const cols2 = env2.view.querySelector(".columns");
  ok("columns still render with sanitized (empty) data", !!cols2);
  const err2 = env2.view.querySelectorAll(".empty").filter((e) => /error/i.test(e.textContent));
  ok("no error box with malformed state", err2.length === 0, err2[0] && err2[0].textContent);

  // ---- Test 7: add a new expense via the + modal, graph reflects it ----
  console.log("\nTest 7: add item via modal");
  // reset to clean sample
  const env3 = buildEnv();
  const C = env3.ctx;
  load(C, "i18n.js"); load(C, "store.js"); load(C, "projection.js"); load(C, "chart.js"); load(C, "raccoon.js"); load(C, "app.js");
  const v3 = env3.view, mr3 = env3.modalRoot;
  // click the left column's add button (+)
  const leftCol = v3.querySelectorAll(".col")[0];
  const addBtn = leftCol.querySelector(".icon-btn");
  ok("found add button in items column", !!addBtn);
  addBtn.dispatch("click", { target: addBtn });
  const form = mr3.querySelector("#modal-form");
  ok("add-item modal opened", !!form);
  // fill fields
  const setF = (name, val) => { const f = mr3.querySelector(`[name="${name}"]`); if (f) { f.value = val; } return f; };
  setF("name", "Test big expense");
  setF("amount", "5000");
  const kindSel = setF("kind", "expense");
  setF("date", env3.win.Store.isoAddDays(30));
  const saveBtn = mr3.querySelector("#m-save");
  ok("found save button", !!saveBtn);
  saveBtn.dispatch("click", { target: saveBtn });
  const st7 = JSON.parse(env3.store["finance-tracker:v2"]);
  const added = st7.items.find((i) => i.name === "Test big expense");
  ok("new item saved to state", !!added && added.amount === 5000 && added.kind === "expense");
  const row7 = v3.querySelectorAll(".list-row").filter((r) => { const tt = r.querySelector(".row-title"); return tt && tt.textContent.includes("Test big expense"); });
  ok("new item row appears in column", row7.length === 1);

  // ---- Test 8: goal marker click shows popover with %+x/x ----
  console.log("\nTest 8: goal marker popover");
  const env4 = buildEnv();
  const C4 = env4.ctx;
  load(C4, "i18n.js"); load(C4, "store.js"); load(C4, "projection.js"); load(C4, "chart.js"); load(C4, "app.js");
  // The chart renders markers as <g class="goal-marker"> with click handlers.
  const markerG = env4.view.querySelectorAll(".goal-marker");
  ok("goal-marker groups rendered in chart", markerG.length >= 1, "got " + markerG.length);
  if (markerG.length) {
    markerG[0].dispatch("click", { target: markerG[0], clientX: 100, clientY: 100, stopPropagation() {} });
    const pop = env4.modalRoot.querySelector(".marker-pop");
    ok("marker popover opened on click", !!pop);
    const pct = pop && pop.querySelector(".mp-pct");
    const frac = pop && pop.querySelector(".mp-frac");
    ok("popover shows percentage", pct && /%/.test(pct.textContent), pct && pct.textContent);
    ok("popover shows x/x fraction", frac && frac.textContent.includes("/"), frac && frac.textContent);
  }

  // ---- Test 9: language switch to Chinese ----
  console.log("\nTest 9: language switch");
  const env5 = buildEnv();
  const C5 = env5.ctx;
  load(C5, "i18n.js"); load(C5, "store.js"); load(C5, "projection.js"); load(C5, "chart.js"); load(C5, "app.js");
  env5.langSel.value = "zh";
  env5.langSel.dispatch("change", { target: env5.langSel });
  const h2s = env5.view.querySelectorAll("h2");
  const colHead = h2s[0];
  ok("column header translated to Chinese", colHead && /收入|支出|目标/.test(colHead.textContent), colHead && colHead.textContent);
  const st9 = JSON.parse(env5.store["finance-tracker:v2"]);
  ok("language persisted", st9.lang === "zh");

  // ---- Test 10: recurring vs one-time occurrence counts ----
  console.log("\nTest 10: recurring projection");
  const st10 = JSON.parse(env5.store["finance-tracker:v2"]);
  const s10 = env5.win.Projection.project(st10, { horizonDays: 730 });
  const recurringItem = st10.items.find((i) => i.recurring);
  const onceItem = st10.items.find((i) => !i.recurring && i.kind === "expense");
  const recCount = s10.events.filter((e) => e.label === recurringItem.name).length;
  const onceCount = s10.events.filter((e) => e.label === onceItem.name).length;
  ok("recurring item repeats (>12 occurrences over 2y)", recCount > 12, recurringItem.name + "=" + recCount);
  ok("one-time item occurs exactly once", onceCount === 1, onceItem.name + "=" + onceCount);

  // ---- Test 11: accounts drive starting balance (EUR-equivalent) ----
  console.log("\nTest 11: accounts = starting balance");
  const st11 = JSON.parse(env5.store["finance-tracker:v2"]);
  const s11 = env5.win.Projection.project(st11, { horizonDays: 730 });
  const rates11 = s11.rates;
  const sumAccEUR = st11.accounts.reduce((a, b) => a + (parseFloat(b.balance) || 0) * (rates11[b.currency] || 1), 0);
  ok("combined starting balance = EUR-equiv sum of accounts", Math.abs(s11.combined.startingBalance - sumAccEUR) < 0.5,
    "combined=" + s11.combined.startingBalance + " sumAccEUR=" + sumAccEUR);
  ok("combined day-0 equals starting balance", Math.abs(s11.combined.confirmed[0] - s11.combined.startingBalance) < 0.5);
  // per-currency start balances
  const eurAcc = st11.accounts.filter((a) => a.currency === "EUR").reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  ok("EUR native start = sum of EUR accounts", Math.abs(s11.byCur.EUR.start - eurAcc) < 0.001, s11.byCur.EUR.start + " vs " + eurAcc);

  // ---- Test 12: pay-later expense shifts 30 days ----
  console.log("\nTest 12: pay-later shift");
  const envP = buildEnv();
  const CP = envP.ctx;
  load(CP, "i18n.js"); load(CP, "store.js"); load(CP, "projection.js"); load(CP, "chart.js"); load(CP, "app.js");
  const StoreP = envP.win.Store;
  const ProjP = envP.win.Projection;
  const base = ProjP.todayISO();
  // Build two identical expenses, one pay-later, both on the same date (day 10).
  const d10 = StoreP.isoAddDays(10);
  const stTest = {
    accounts: [{ id: "a", name: "x", balance: 1000, currency: "EUR" }],
    items: [
      { id: "e1", name: "Normal exp", amount: 100, kind: "expense", date: d10, recurring: false, potential: false, payLater: false, included: true },
      { id: "e2", name: "Later exp", amount: 100, kind: "expense", date: d10, recurring: false, potential: false, payLater: true, included: true },
    ],
    goals: [],
  };
  const sp = ProjP.project(stTest, { horizonDays: 100 });
  const normalEv = sp.events.find((e) => e.label === "Normal exp");
  const laterEv = sp.events.find((e) => e.label === "Later exp");
  ok("normal expense applies at day 10", normalEv && normalEv.dateIndex === 10, normalEv && normalEv.dateIndex);
  ok("pay-later expense applies at day 40 (10 + 30)", laterEv && laterEv.dateIndex === 40, laterEv && laterEv.dateIndex);
  // balance should NOT drop at day 10 for the later one, only the normal 100
  const dropAt10 = sp.combined.confirmed[9] - sp.combined.confirmed[10];
  const dropAt40 = sp.combined.confirmed[39] - sp.combined.confirmed[40];
  ok("day-10 drop is only the normal expense (100)", Math.abs(dropAt10 - 100) < 0.01, "drop=" + dropAt10);
  ok("day-40 drop is the pay-later expense (100)", Math.abs(dropAt40 - 100) < 0.01, "drop=" + dropAt40);
  // pay-later only affects expenses: income with payLater flag should NOT shift
  const stInc = { accounts: [], items: [{ id: "i1", name: "Inc", amount: 50, kind: "income", date: d10, payLater: true, included: true }], goals: [] };
  const spi = ProjP.project(stInc, { horizonDays: 100 });
  const incEv = spi.events.find((e) => e.label === "Inc");
  ok("income ignores pay-later (stays at day 10)", incEv && incEv.dateIndex === 10, incEv && incEv.dateIndex);

  // ---- Test 13: pay-later checkbox in the add-item modal persists ----
  console.log("\nTest 13: pay-later checkbox in modal");
  const envM = buildEnv();
  const CM = envM.ctx;
  load(CM, "i18n.js"); load(CM, "store.js"); load(CM, "projection.js"); load(CM, "chart.js"); load(CM, "app.js");
  const addBtnM = envM.view.querySelectorAll(".col")[0].querySelector(".icon-btn");
  addBtnM.dispatch("click", { target: addBtnM });
  const plBox = envM.modalRoot.querySelector('[name="payLater"]');
  ok("pay-later checkbox present in item modal", !!plBox);
  const setM = (n, v) => { const f = envM.modalRoot.querySelector(`[name="${n}"]`); if (f) f.value = v; return f; };
  setM("name", "BNPL thing"); setM("amount", "200"); setM("kind", "expense"); setM("date", envM.win.Store.isoAddDays(5));
  if (plBox) plBox.checked = true;
  envM.modalRoot.querySelector("#m-save").dispatch("click", { target: {} });
  const stM = JSON.parse(envM.store["finance-tracker:v2"]);
  const savedM = stM.items.find((i) => i.name === "BNPL thing");
  ok("item saved with payLater=true", savedM && savedM.payLater === true, JSON.stringify(savedM));

  // ---- Test 14: multi-currency conversion into combined EUR ----
  console.log("\nTest 14: currency conversion");
  const envC = buildEnv();
  load(envC.ctx, "i18n.js"); load(envC.ctx, "store.js"); load(envC.ctx, "projection.js"); load(envC.ctx, "chart.js"); load(envC.ctx, "app.js");
  const ProjC = envC.win.Projection;
  const stC = {
    rates: { EUR: 1, USD: 0.5, CNY: 0.1 },
    accounts: [
      { id: "1", name: "e", balance: 100, currency: "EUR" },
      { id: "2", name: "u", balance: 100, currency: "USD" },
      { id: "3", name: "c", balance: 100, currency: "CNY" },
    ],
    items: [], goals: [],
  };
  const sc = ProjC.project(stC, { horizonDays: 10 });
  ok("per-currency starts kept native (EUR100/USD100/CNY100)",
    sc.byCur.EUR.start === 100 && sc.byCur.USD.start === 100 && sc.byCur.CNY.start === 100);
  // combined = 100*1 + 100*0.5 + 100*0.1 = 160
  ok("combined EUR-equiv uses the rates (100+50+10=160)", Math.abs(sc.combined.startingBalance - 160) < 0.001,
    "combined=" + sc.combined.startingBalance);

  // ---- Test 15: filter isolates a currency in the chart ----
  console.log("\nTest 15: currency filter in chart");
  // default render is ALL → clicking a filter button re-renders with that currency
  const fbtns = envC.view.querySelectorAll(".tl-fbtn");
  ok("filter buttons rendered (All + 3 currencies)", fbtns.length === 4, "got " + fbtns.length);
  // click "USD" (3rd button: All, EUR, USD, CNY)
  const usdBtn = fbtns.find((b) => b.textContent.includes("USD"));
  ok("found USD filter button", !!usdBtn);
  if (usdBtn) {
    usdBtn.dispatch("click", { target: usdBtn });
    const activeBtn = envC.view.querySelectorAll(".tl-fbtn.active").find((b) => b.textContent.includes("USD"));
    ok("USD filter becomes active after click", !!activeBtn);
  }

  // ---- Test 16: goal split fulfillment + bought removes per-currency ----
  console.log("\nTest 16: goal currency split");
  const envG = buildEnv();
  load(envG.ctx, "i18n.js"); load(envG.ctx, "store.js"); load(envG.ctx, "projection.js"); load(envG.ctx, "chart.js"); load(envG.ctx, "app.js");
  const ProjG = envG.win.Projection;
  const d100 = envG.win.Store.isoAddDays(100);
  const stG = {
    rates: { EUR: 1, USD: 0.9, CNY: 0.1 },
    accounts: [
      { id: "1", name: "e", balance: 500, currency: "EUR" },
      { id: "2", name: "u", balance: 200, currency: "USD" },
      { id: "3", name: "c", balance: 3000, currency: "CNY" },
    ],
    items: [],
    goals: [{ id: "g", name: "Split goal", splits: { EUR: 1000, USD: 100, CNY: 2000 }, date: d100, bought: false, included: true }],
  };
  const sg = ProjG.project(stG, { horizonDays: 200 });
  const m = sg.markers.find((x) => x.name === "Split goal");
  ok("marker has per-currency fulfillment", m && m.perCur.EUR && m.perCur.USD && m.perCur.CNY);
  // EUR: have 500 / need 1000 → 50%; USD: 200/100 → 100%; CNY: 3000/2000 → 100%
  ok("EUR fulfillment 50%", m.perCur.EUR.pct === 50, "EUR pct=" + m.perCur.EUR.pct);
  ok("USD fulfillment 100%", m.perCur.USD.pct === 100, "USD pct=" + m.perCur.USD.pct);
  ok("CNY fulfillment 100%", m.perCur.CNY.pct === 100, "CNY pct=" + m.perCur.CNY.pct);
  // bought → each currency pool drops by its split at the goal date
  stG.goals[0].bought = true;
  const sgb = ProjG.project(stG, { horizonDays: 200 });
  const i100 = sgb.markers.find((x) => x.name === "Split goal").dateIndex;
  const dEUR = sgb.byCur.EUR.confirmed[i100 - 1] - sgb.byCur.EUR.confirmed[i100];
  const dUSD = sgb.byCur.USD.confirmed[i100 - 1] - sgb.byCur.USD.confirmed[i100];
  const dCNY = sgb.byCur.CNY.confirmed[i100 - 1] - sgb.byCur.CNY.confirmed[i100];
  ok("bought removes EUR split (1000)", Math.abs(dEUR - 1000) < 0.01, "dEUR=" + dEUR);
  ok("bought removes USD split (100)", Math.abs(dUSD - 100) < 0.01, "dUSD=" + dUSD);
  ok("bought removes CNY split (2000)", Math.abs(dCNY - 2000) < 0.01, "dCNY=" + dCNY);

  // ---- Test 17: theme switcher ----
  console.log("\nTest 17: theme switcher");
  const envT = buildEnv();
  const docT = envT.document;
  // theme select element
  const themeSel = new El("select"); themeSel.setAttribute("id", "theme-select");
  docT.body.appendChild(themeSel); docT.register(themeSel);
  load(envT.ctx, "i18n.js"); load(envT.ctx, "store.js"); load(envT.ctx, "projection.js"); load(envT.ctx, "chart.js"); load(envT.ctx, "app.js");
  ok("default theme applied to body (luxury)", docT.body.getAttribute("data-theme") === "luxury", docT.body.getAttribute("data-theme"));
  ok("theme select populated with 5 options", themeSel.querySelectorAll("option").length === 5, themeSel.querySelectorAll("option").length);
  // switch to midnight
  themeSel.value = "midnight";
  themeSel.dispatch("change", { target: themeSel });
  ok("body theme updates on change", docT.body.getAttribute("data-theme") === "midnight", docT.body.getAttribute("data-theme"));
  const stT = JSON.parse(envT.store["finance-tracker:v2"]);
  ok("theme persisted to state", stT.theme === "midnight", stT.theme);

  // ---- Test 18: raccoon easter egg ----
  console.log("\nTest 18: raccoon");
  const envR = buildEnv();
  const themeSelR = new El("select"); themeSelR.setAttribute("id", "theme-select");
  envR.document.body.appendChild(themeSelR); envR.document.register(themeSelR);
  load(envR.ctx, "i18n.js"); load(envR.ctx, "store.js"); load(envR.ctx, "projection.js"); load(envR.ctx, "chart.js"); load(envR.ctx, "raccoon.js"); load(envR.ctx, "app.js");
  const Raccoon = envR.win.Raccoon;

  // random distribution: always 1..10, mean near 5
  let bad = 0, sum = 0, N = 5000, minSeen = 99, maxSeen = 0;
  for (let i = 0; i < N; i++) { const r = Raccoon.rollTapTarget(); if (r < 1 || r > 10 || r !== Math.round(r)) bad++; sum += r; minSeen = Math.min(minSeen, r); maxSeen = Math.max(maxSeen, r); }
  ok("tap target always an integer in 1..10", bad === 0, "bad=" + bad);
  const mean = sum / N;
  // The true midpoint of integers 1..10 is 5.5, so a symmetric distribution
  // centers there (not 5). Allow a small sampling tolerance.
  ok("distribution centered (mean ~5.5)", mean > 5.1 && mean < 5.9, "mean=" + mean.toFixed(2));
  ok("distribution spans the range (hits 1 and 10)", minSeen === 1 && maxSeen === 10, "min=" + minSeen + " max=" + maxSeen);

  // mounted in the goals column
  const raccoonEl = envR.view.querySelector(".raccoon");
  ok("raccoon mounted in goals column", !!raccoonEl);
  const goalCol = envR.view.querySelectorAll(".col-goals")[0];
  ok("raccoon is inside the goals column", goalCol && goalCol.querySelector(".raccoon") === raccoonEl);
  ok("raccoon starts hidden", raccoonEl && raccoonEl.classList.contains("hiding"));

  // tapping exactly `target` times turns him around; fewer does not
  const inst = Raccoon.mount(new El("div"));
  inst._state.target = 4; inst._state.taps = 0; inst._state.turned = false;
  inst.el.classList.remove("turned"); inst.el.classList.add("hiding");
  inst.tap(); inst.tap(); inst.tap();
  ok("not turned before reaching target", !inst.el.classList.contains("turned") && inst.el.classList.contains("hiding"));
  inst.tap(); // 4th → reaches target
  ok("turns around when target reached", inst.el.classList.contains("turned") && !inst.el.classList.contains("hiding"));
  ok("taps ignored while turned (no crash)", (inst.tap(), inst.el.classList.contains("turned")));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run();
