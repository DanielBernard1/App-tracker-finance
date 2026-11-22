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
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
    confirm: () => true,
    parseFloat, parseInt, isNaN,
  };
  sandbox.window = sandbox;   // bare `window` === global scope
  sandbox.globalThis = sandbox;
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
  const endBefore = before.confirmed[730];

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
  const endAfter = after.confirmed[730];
  ok("graph projection dropped after unchecking income", endAfter < endBefore - 1,
    "before=" + endBefore + " after=" + endAfter);
  const toggledItem = stateAfter.items.find((i) => i.name === bigIncome.name);
  ok("item persisted as excluded", toggledItem && toggledItem.included === false);

  // ---- Test 4: goal markers + fulfillment math ----
  console.log("\nTest 4: goal markers");
  ok("goal markers exist in series", after.markers.length >= 1, "got " + after.markers.length);
  const mk = after.markers[0];
  ok("marker has pct and x/x fields", typeof mk.pct === "number" && typeof mk.toward === "number" && typeof mk.target === "number",
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
  const dip = boughtSeries.confirmed[gIdx - 1] - boughtSeries.confirmed[gIdx];
  ok("balance dips at the bought goal's date", dip >= gb.target - 0.01, "dip=" + dip + " target=" + gb.target);

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
  load(C, "i18n.js"); load(C, "store.js"); load(C, "projection.js"); load(C, "chart.js"); load(C, "app.js");
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

  // ---- Test 11: accounts drive starting balance ----
  console.log("\nTest 11: accounts = starting balance");
  const st11 = JSON.parse(env5.store["finance-tracker:v2"]);
  const sumAcc = st11.accounts.reduce((a, b) => a + (parseFloat(b.balance) || 0), 0);
  const s11 = env5.win.Projection.project(st11, { horizonDays: 730 });
  ok("starting balance equals sum of accounts", Math.abs(s11.startingBalance - sumAcc) < 0.001,
    "startingBalance=" + s11.startingBalance + " sumAcc=" + sumAcc);
  ok("day-0 confirmed equals starting balance", Math.abs(s11.confirmed[0] - sumAcc) < 0.001);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run();
