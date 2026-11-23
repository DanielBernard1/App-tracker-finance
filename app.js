(function () {
  "use strict";

  let state = window.Store.load();
  if (!state.seeded && !(state.items && state.items.length) && !(state.accounts && state.accounts.length)) {
    state = window.Store.seed();
    window.Store.save(state);
  }
  window.STATE_LANG = state.lang;

  const view = document.getElementById("view");
  const modalRoot = document.getElementById("modal-root");
  const THEMES = window.Store.THEMES;

  function applyTheme() {
    const th = THEMES.includes(state.theme) ? state.theme : "luxury";
    document.body.setAttribute("data-theme", th);
  }

  // Read the current theme's chart colors from CSS variables.
  function chartColors() {
    try {
      const cs = getComputedStyle(document.body);
      const v = (name, fb) => (cs.getPropertyValue(name).trim() || fb);
      return {
        pos: v("--chart-pos", "#5b8cff"),
        posLt: v("--chart-pos-lt", "#8fb0ff"),
        neg: v("--chart-neg", "#ff6b6b"),
        negLt: v("--chart-neg-lt", "#ff9a9a"),
        grid: v("--chart-grid", "#2a2f3a"),
        ink: v("--chart-ink", "#e6e8ec"),
        surface: v("--surface", "#171a21"),
      };
    } catch (e) {
      return null;
    }
  }

  const CURRENCIES = window.Store.CURRENCIES; // ["EUR","USD","CNY"]
  const SYMBOLS = window.Store.SYMBOLS;
  let chartFilter = "ALL"; // ALL | EUR | USD | CNY

  // ---------- helpers ----------
  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // Format an amount in a specific currency (native units).
  function money(amount, currency) {
    const cur = currency && CURRENCIES.includes(currency) ? currency : "EUR";
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(amount || 0);
    } catch (e) { return (SYMBOLS[cur] || "") + (amount || 0).toFixed(2); }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  }

  function todayISO() { return window.Store.isoAddDays(0); }

  function persist() { window.Store.save(state); }

  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function closeModal() { modalRoot.innerHTML = ""; }

  // ---------- main render ----------
  function render() {
    applyStaticI18n();
    view.innerHTML = "";
    try {
      renderChart();
    } catch (err) {
      view.appendChild(el(`<div class="card"><div class="empty">Chart error: ${esc(err && err.message)}</div></div>`));
    }
    try {
      renderColumns();
    } catch (err) {
      const box = document.createElement("div");
      box.className = "card";
      box.innerHTML = '<div class="empty" style="color:#ff6b6b">Columns error: ' + esc(err && (err.stack || err.message)) + "</div>";
      view.appendChild(box);
      console.error(err);
    }
  }

  function applyStaticI18n() {
    document.documentElement.lang = state.lang === "zh" ? "zh" : "en";
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.getAttribute("data-i18n")); });
  }

  // ----- chart -----
  function renderChart() {
    const series = window.Projection.project(state, { horizonDays: 730 });
    const card = el('<div class="card timeline-card"></div>');
    const host = el('<div class="timeline-host"></div>');
    card.appendChild(host);
    view.appendChild(card);

    // legend
    view.appendChild(el(`
      <div class="legend">
        <span class="lg"><i class="sw sw-confirmed"></i>${esc(t("legConfirmed"))}</span>
        <span class="lg"><i class="sw sw-optimistic"></i>${esc(t("legOptimistic"))}</span>
        <span class="lg"><i class="sw sw-neg"></i>${esc(t("legNegative"))}</span>
        <span class="lg"><i class="dot dot-goal"></i>${esc(t("legGoal"))}</span>
        <span class="lg"><i class="dot dot-pay"></i>${esc(t("legBought"))}</span>
      </div>`));

    this_lastSeries = series;
    requestAnimationFrame(() => {
      window.Chart.render(host, series, {
        filter: chartFilter,
        fmt: (v, cur) => money(v, cur === "EUR-equiv" ? "EUR" : cur),
        fmtDate: (iso) => fmtDate(iso),
        lang: state.lang,
        labels: { guaranteed: t("legConfirmed"), potential: t("legOptimistic"), all: t("filterAll") },
        symbols: SYMBOLS,
        fixedAxis: { hi: 15000, lo: -5000 },
        colors: chartColors(),
        onMarkerClick: (mk, cx, cy) => showMarkerPopover(mk, cx, cy),
        onFilterChange: (f) => { chartFilter = f; render(); },
      });
    });
  }

  let this_lastSeries = null;

  function showMarkerPopover(mk, clientX, clientY) {
    // Per-currency fulfillment rows.
    let rows = "";
    CURRENCIES.forEach((c) => {
      const pc = mk.perCur[c];
      if (!pc) return;
      rows += `<div class="mp-row"><span class="mp-row-cur">${esc(SYMBOLS[c])} ${c}</span>`
        + `<span class="mp-row-pct">${pc.pct}%</span></div>`
        + `<div class="mp-row-sub">${esc(money(pc.toward, c))} / ${esc(money(pc.target, c))}</div>`;
    });
    const dateISO = this_lastSeries ? this_lastSeries.dates[mk.dateIndex] : "";
    const pop = el(`
      <div class="marker-pop">
        <div class="mp-name">${esc(mk.name)}</div>
        <div class="mp-pct">${mk.pct}%</div>
        <div class="mp-frac">${esc(money(mk.towardEUR, "EUR"))} / ${esc(money(mk.targetEUR, "EUR"))} <span class="mp-eq">${esc(t("eurEquiv"))}</span></div>
        <div class="mp-splits">${rows}</div>
        <div class="mp-sub">${esc(t("byDate"))} · ${esc(fmtDate(dateISO))}</div>
        ${mk.bought ? `<div class="mp-sub mp-bought">${esc(t("boughtFlag"))}</div>` : ""}
      </div>`);
    const back = el('<div class="pop-backdrop"></div>');
    back.addEventListener("click", () => { modalRoot.innerHTML = ""; });
    back.appendChild(pop);
    modalRoot.innerHTML = "";
    modalRoot.appendChild(back);
    const w = 200;
    let left = Math.min(Math.max(8, clientX - w / 2), window.innerWidth - w - 8);
    pop.style.left = left + "px";
    pop.style.top = Math.max(60, clientY + 14) + "px";
  }

  // ----- columns -----
  function renderColumns() {
    const cols = el('<div class="columns"></div>');

    // Left: income/expenses
    const left = el('<div class="col"></div>');
    left.appendChild(colHeader(t("colItems"), () => openItemModal()));
    const items = (Array.isArray(state.items) ? [...state.items] : []).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (!items.length) left.appendChild(el(`<div class="empty">${esc(t("noItems"))}</div>`));
    items.forEach((it) => left.appendChild(itemRow(it)));

    // Right: goals
    const right = el('<div class="col col-goals"></div>');
    right.appendChild(colHeader(t("colGoals"), () => openGoalModal()));
    const goals = (Array.isArray(state.goals) ? [...state.goals] : []).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (!goals.length) right.appendChild(el(`<div class="empty">${esc(t("noGoals"))}</div>`));
    goals.forEach((g) => right.appendChild(goalRow(g)));

    cols.appendChild(left);
    cols.appendChild(right);
    view.appendChild(cols);

    // Easter egg: a little raccoon hiding behind the Goals column (upper-right).
    if (window.Raccoon) { try { window.Raccoon.mount(right); } catch (e) {} }

    // bottom actions: accounts + categories
    const actions = el('<div class="bottom-actions"></div>');
    const accBtn = el(`<button class="btn ghost sm">${esc(t("editAccounts"))}</button>`);
    accBtn.addEventListener("click", openAccountsModal);
    const catBtn = el(`<button class="btn ghost sm">${esc(t("editCategories"))}</button>`);
    catBtn.addEventListener("click", openCategoriesModal);
    const rateBtn = el(`<button class="btn ghost sm">${esc(t("editRates"))}</button>`);
    rateBtn.addEventListener("click", openRatesModal);
    actions.appendChild(accBtn);
    actions.appendChild(catBtn);
    actions.appendChild(rateBtn);
    view.appendChild(actions);
  }

  function colHeader(title, onAdd) {
    const h = el(`<div class="col-head"><h2>${esc(title)}</h2></div>`);
    const btn = el(`<button class="icon-btn" aria-label="add">+</button>`);
    btn.addEventListener("click", onAdd);
    h.appendChild(btn);
    return h;
  }

  function itemRow(it) {
    const sign = it.kind === "expense" ? "−" : "+";
    const amtCls = it.kind === "expense" ? "neg" : "pos";
    const row = el(`
      <div class="list-row ${it.included === false ? "off" : ""}">
        <label class="chk">
          <input type="checkbox" ${it.included !== false ? "checked" : ""} />
          <span class="chk-box"></span>
        </label>
        <div class="row-main">
          <span class="row-title">${esc(it.name)} ${it.potential ? `<span class="chip">${esc(t("potentialTag"))}</span>` : ""} ${it.payLater && it.kind === "expense" ? `<span class="chip warn">${esc(t("payLaterTag"))}</span>` : ""} ${it.recurring ? `<span class="chip muted">↻</span>` : ""}</span>
          <span class="row-sub">${esc(fmtDate(it.date))} · ${esc(it.category || "")}</span>
        </div>
        <span class="row-amount ${amtCls}">${sign}${esc(money(num(it.amount), it.currency))}</span>
      </div>`);
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.addEventListener("change", (e) => { it.included = e.target.checked; persist(); render(); });
    const main = row.querySelector(".row-main");
    if (main) main.addEventListener("click", () => openItemModal(it));
    const amt = row.querySelector(".row-amount");
    if (amt) amt.addEventListener("click", () => openItemModal(it));
    return row;
  }

  function goalSplitSummary(g) {
    const sp = g.splits || {};
    const parts = CURRENCIES.filter((c) => num(sp[c]) > 0).map((c) => money(num(sp[c]), c));
    return parts.length ? parts.join(" + ") : money(0, "EUR");
  }

  function goalRow(g) {
    const row = el(`
      <div class="list-row ${g.included === false ? "off" : ""}">
        <label class="chk">
          <input type="checkbox" ${g.included !== false ? "checked" : ""} />
          <span class="chk-box"></span>
        </label>
        <div class="row-main">
          <span class="row-title">${esc(g.name)} ${g.bought ? `<span class="chip warn">${esc(t("boughtTag"))}</span>` : ""}</span>
          <span class="row-sub">${esc(goalSplitSummary(g))} · ${esc(fmtDate(g.date))}</span>
        </div>
        <button class="btn ghost xs bought-btn">${g.bought ? esc(t("unbuy")) : esc(t("buy"))}</button>
      </div>`);
    const gcb = row.querySelector('input[type="checkbox"]');
    if (gcb) gcb.addEventListener("change", (e) => { g.included = e.target.checked; persist(); render(); });
    const bbtn = row.querySelector(".bought-btn");
    if (bbtn) bbtn.addEventListener("click", (e) => { e.stopPropagation(); g.bought = !g.bought; persist(); render(); });
    const gmain = row.querySelector(".row-main");
    if (gmain) gmain.addEventListener("click", () => openGoalModal(g));
    return row;
  }

  // ---------- modals ----------
  function currencyOptions(selected) {
    return CURRENCIES.map((c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${esc(SYMBOLS[c])} ${c}</option>`).join("");
  }

  function categoryOptions(selected) {
    const cats = state.categories && state.categories.length ? state.categories : ["Other"];
    return cats.map((c) => `<option value="${esc(c)}" ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("");
  }

  function openItemModal(item) {
    const isEdit = !!item;
    const k = item ? item.kind : "expense";
    const fields = `
      <div class="field"><label>${esc(t("name"))}</label><input name="name" type="text" value="${esc(item ? item.name : "")}" placeholder="${esc(t("itemPlaceholder"))}" /></div>
      <div class="field-row">
        <div class="field"><label>${esc(t("amount"))}</label><input name="amount" type="number" inputmode="decimal" step="0.01" value="${esc(item ? item.amount : "")}" placeholder="0.00" /></div>
        <div class="field" style="flex:0 0 96px"><label>${esc(t("currency"))}</label>
          <select name="currency">${currencyOptions(item ? item.currency : "EUR")}</select>
        </div>
        <div class="field" style="flex:0 0 120px"><label>${esc(t("type"))}</label>
          <select name="kind">
            <option value="income" ${k === "income" ? "selected" : ""}>${esc(t("income"))}</option>
            <option value="expense" ${k === "expense" ? "selected" : ""}>${esc(t("expense"))}</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>${esc(t("date"))}</label><input name="date" type="date" value="${esc(item ? item.date : todayISO())}" /></div>
        <div class="field"><label>${esc(t("category"))}</label><select name="category">${categoryOptions(item ? item.category : "Other")}</select></div>
      </div>
      <div class="field toggles">
        <label class="switch"><input name="recurring" type="checkbox" ${item && item.recurring ? "checked" : ""}/> ${esc(t("recurring"))}</label>
        <label class="switch"><input name="potential" type="checkbox" ${item && item.potential ? "checked" : ""}/> ${esc(t("potential"))}</label>
        <label class="switch"><input name="payLater" type="checkbox" ${item && item.payLater ? "checked" : ""}/> ${esc(t("payLaterOpt"))}</label>
      </div>`;
    openModal(isEdit ? t("editItem") : t("addItem"), fields,
      (d) => {
        if (!d.name) return false;
        const payload = {
          name: d.name, amount: num(d.amount), currency: d.currency, kind: d.kind, date: d.date,
          category: d.category, recurring: !!d.recurring, potential: !!d.potential,
          payLater: !!d.payLater,
        };
        if (item) Object.assign(item, payload);
        else state.items.push(Object.assign({ id: Store.uid(), included: true }, payload));
      },
      item ? { _delete: () => { state.items = state.items.filter((z) => z.id !== item.id); } } : null);
  }

  function openGoalModal(goal) {
    const isEdit = !!goal;
    const sp = (goal && goal.splits) || { EUR: 0, USD: 0, CNY: 0 };
    const splitInputs = CURRENCIES.map((c) =>
      `<div class="field"><label>${esc(SYMBOLS[c])} ${c}</label><input name="split_${c}" type="number" inputmode="decimal" step="0.01" value="${esc(sp[c] || "")}" placeholder="0" /></div>`
    ).join("");
    const fields = `
      <div class="field"><label>${esc(t("name"))}</label><input name="name" type="text" value="${esc(goal ? goal.name : "")}" placeholder="${esc(t("goalPlaceholder"))}" /></div>
      <div class="field"><label>${esc(t("targetSplit"))}</label><div class="field-row">${splitInputs}</div></div>
      <div class="field-row">
        <div class="field"><label>${esc(t("date"))}</label><input name="date" type="date" value="${esc(goal ? goal.date : todayISO())}" /></div>
      </div>
      <div class="field toggles">
        <label class="switch"><input name="bought" type="checkbox" ${goal && goal.bought ? "checked" : ""}/> ${esc(t("markBought"))}</label>
      </div>`;
    openModal(isEdit ? t("editGoal") : t("addGoal"), fields,
      (d) => {
        if (!d.name) return false;
        const splits = {};
        CURRENCIES.forEach((c) => { splits[c] = num(d["split_" + c]); });
        if (splits.EUR + splits.USD + splits.CNY <= 0) return false;
        const payload = { name: d.name, splits, date: d.date, bought: !!d.bought };
        if (goal) Object.assign(goal, payload);
        else state.goals.push(Object.assign({ id: Store.uid(), included: true }, payload));
      },
      goal ? { _delete: () => { state.goals = state.goals.filter((z) => z.id !== goal.id); } } : null);
  }

  function openModal(title, fieldsHtml, onSave, existing) {
    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`
      <div class="modal">
        <h2>${esc(title)}</h2>
        <form id="modal-form">${fieldsHtml}</form>
        <div class="modal-actions">
          ${existing ? `<button type="button" class="btn danger" id="m-del">${esc(t("delete"))}</button>` : ""}
          <button type="button" class="btn ghost" id="m-cancel">${esc(t("cancel"))}</button>
          <button type="button" class="btn" id="m-save">${esc(t("save"))}</button>
        </div>
      </div>`);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    modal.querySelector("#m-cancel").addEventListener("click", closeModal);
    modal.querySelector("#m-save").addEventListener("click", () => {
      const form = modal.querySelector("#modal-form");
      const data = {};
      form.querySelectorAll("[name]").forEach((f) => { data[f.name] = f.type === "checkbox" ? f.checked : f.value.trim(); });
      if (onSave(data) !== false) { persist(); closeModal(); render(); }
    });
    const del = modal.querySelector("#m-del");
    if (del) del.addEventListener("click", () => { existing._delete(); persist(); closeModal(); render(); });
    modalRoot.innerHTML = "";
    modalRoot.appendChild(backdrop);
    const first = modal.querySelector("input, select");
    if (first) setTimeout(() => first.focus(), 50);
  }

  // Accounts
  function openAccountsModal() {
    const card = el('<div class="card" style="margin:0 0 12px"></div>');
    function redraw() {
      card.innerHTML = "";
      if (!state.accounts.length) card.appendChild(el(`<div class="empty">${esc(t("noAccounts"))}</div>`));
      state.accounts.forEach((a) => {
        const row = el(`<div class="row"><div class="row-main"><span class="row-title">${esc(a.name)}</span><span class="row-sub">${esc(a.currency)}</span></div><div class="row-right"><span class="row-amount">${esc(money(num(a.balance)))}</span><button class="icon-btn">×</button></div></div>`);
        row.querySelector(".icon-btn").addEventListener("click", () => { state.accounts = state.accounts.filter((z) => z.id !== a.id); persist(); redraw(); });
        card.appendChild(row);
      });
      const total = state.accounts.reduce((s, a) => s + num(a.balance), 0);
      card.appendChild(el(`<div class="row" style="border:none"><div class="row-main"><span class="row-sub">${esc(t("startingBalance"))}</span></div><span class="row-amount">${esc(money(total))}</span></div>`));
    }
    redraw();
    const addForm = el(`<form id="acc-form"><div class="field-row"><div class="field" style="flex:1.4"><label>${esc(t("accountName"))}</label><input name="name" type="text" placeholder="${esc(t("accountPlaceholder"))}" /></div><div class="field"><label>${esc(t("balance"))}</label><input name="balance" type="number" inputmode="decimal" step="0.01" placeholder="0.00" /></div><div class="field" style="flex:0 0 84px"><label>${esc(t("currency"))}</label><select name="currency">${CURRENCIES.map((c) => `<option>${c}</option>`).join("")}</select></div></div><button type="button" class="btn ghost sm block" id="acc-add">+ ${esc(t("addAccount"))}</button></form>`);
    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`<div class="modal"><h2>${esc(t("accounts"))}</h2></div>`);
    modal.appendChild(card); modal.appendChild(addForm);
    const actions = el(`<div class="modal-actions"><button type="button" class="btn block" id="acc-done">${esc(t("done"))}</button></div>`);
    modal.appendChild(actions); backdrop.appendChild(modal);
    backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) { closeModal(); render(); } });
    addForm.querySelector("#acc-add").addEventListener("click", () => {
      const name = addForm.name.value.trim(); if (!name) return;
      state.accounts.push({ id: Store.uid(), name, balance: num(addForm.balance.value), currency: addForm.currency.value });
      persist(); addForm.name.value = ""; addForm.balance.value = ""; redraw();
    });
    actions.querySelector("#acc-done").addEventListener("click", () => { closeModal(); render(); });
    modalRoot.innerHTML = ""; modalRoot.appendChild(backdrop);
  }

  // Categories (editable list)
  function openCategoriesModal() {
    if (!state.categories) state.categories = [];
    const card = el('<div class="card" style="margin:0 0 12px"></div>');
    function redraw() {
      card.innerHTML = "";
      if (!state.categories.length) card.appendChild(el(`<div class="empty">${esc(t("noCategories"))}</div>`));
      state.categories.forEach((c, idx) => {
        const row = el(`<div class="row"><div class="row-main"><span class="row-title">${esc(c)}</span></div><button class="icon-btn">×</button></div>`);
        row.querySelector(".icon-btn").addEventListener("click", () => { state.categories.splice(idx, 1); persist(); redraw(); });
        card.appendChild(row);
      });
    }
    redraw();
    const addForm = el(`<form id="cat-form"><div class="field-row"><div class="field"><label>${esc(t("newCategory"))}</label><input name="cat" type="text" placeholder="${esc(t("categoryPlaceholder"))}" /></div></div><button type="button" class="btn ghost sm block" id="cat-add">+ ${esc(t("addCategory"))}</button></form>`);
    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`<div class="modal"><h2>${esc(t("categories"))}</h2></div>`);
    modal.appendChild(card); modal.appendChild(addForm);
    const actions = el(`<div class="modal-actions"><button type="button" class="btn block" id="cat-done">${esc(t("done"))}</button></div>`);
    modal.appendChild(actions); backdrop.appendChild(modal);
    backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) { closeModal(); render(); } });
    addForm.querySelector("#cat-add").addEventListener("click", () => {
      const v = addForm.cat.value.trim(); if (!v) return;
      if (!state.categories.includes(v)) state.categories.push(v);
      persist(); addForm.cat.value = ""; redraw();
    });
    actions.querySelector("#cat-done").addEventListener("click", () => { closeModal(); render(); });
    modalRoot.innerHTML = ""; modalRoot.appendChild(backdrop);
  }

  // Exchange rates editor (manual, into EUR).
  function openRatesModal() {
    if (!state.rates) state.rates = { EUR: 1, USD: 0.92, CNY: 0.13 };
    const rows = CURRENCIES.filter((c) => c !== "EUR").map((c) =>
      `<div class="field"><label>1 ${esc(SYMBOLS[c])} ${c} = ? € EUR</label><input name="rate_${c}" type="number" inputmode="decimal" step="0.0001" value="${esc(state.rates[c])}" /></div>`
    ).join("");
    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`
      <div class="modal">
        <h2>${esc(t("rates"))}</h2>
        <p class="row-sub" style="margin:0 0 14px">${esc(t("ratesHint"))}</p>
        <form id="rate-form">${rows}</form>
        <div class="modal-actions">
          <button type="button" class="btn ghost" id="r-cancel">${esc(t("cancel"))}</button>
          <button type="button" class="btn" id="r-save">${esc(t("save"))}</button>
        </div>
      </div>`);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    modal.querySelector("#r-cancel").addEventListener("click", closeModal);
    modal.querySelector("#r-save").addEventListener("click", () => {
      CURRENCIES.filter((c) => c !== "EUR").forEach((c) => {
        const f = modal.querySelector(`[name="rate_${c}"]`);
        if (f) { const v = num(f.value); if (v > 0) state.rates[c] = v; }
      });
      state.rates.EUR = 1;
      persist(); closeModal(); render();
    });
    modalRoot.innerHTML = ""; modalRoot.appendChild(backdrop);
  }

  // ---------- settings ----------
  function openSettingsModal() {
    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`
      <div class="modal">
        <h2>${esc(t("settings"))}</h2>
        <p class="row-sub" style="margin:0 0 16px">${esc(t("settingsHint"))}</p>
        <button type="button" class="btn ghost block" id="s-sample" style="margin-bottom:10px">${esc(t("loadSample"))}</button>
        <button type="button" class="btn danger block" id="s-clear" style="margin-bottom:16px">${esc(t("clearAll"))}</button>
        <div class="modal-actions"><button type="button" class="btn ghost block" id="s-close">${esc(t("done"))}</button></div>
      </div>`);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    modal.querySelector("#s-sample").addEventListener("click", () => {
      if (!confirm(t("confirmSample"))) return;
      const lang = state.lang; state = window.Store.seed(); state.lang = lang; window.STATE_LANG = lang; persist(); closeModal(); render();
    });
    modal.querySelector("#s-clear").addEventListener("click", () => {
      if (!confirm(t("confirmClear"))) return;
      const lang = state.lang; state = structuredClone(window.Store.DEFAULT_STATE); state.seeded = true; state.lang = lang; window.STATE_LANG = lang; persist(); closeModal(); render();
    });
    modal.querySelector("#s-close").addEventListener("click", closeModal);
    modalRoot.innerHTML = ""; modalRoot.appendChild(backdrop);
  }

  // ---------- events ----------
  const langSelect = document.getElementById("lang-select");
  langSelect.value = state.lang;
  langSelect.addEventListener("change", () => { state.lang = langSelect.value; window.STATE_LANG = state.lang; persist(); render(); });
  document.getElementById("settings-btn").addEventListener("click", openSettingsModal);

  // Theme picker
  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    const labels = { luxury: "Luxury", midnight: "Midnight", graphite: "Graphite", sand: "Sand", mist: "Mist" };
    themeSelect.innerHTML = THEMES.map((th) => `<option value="${th}">${labels[th] || th}</option>`).join("");
    themeSelect.value = THEMES.includes(state.theme) ? state.theme : "luxury";
    themeSelect.addEventListener("change", () => {
      state.theme = themeSelect.value;
      persist();
      applyTheme();
      render(); // re-render so the chart picks up new theme colors
    });
  }

  // ---------- init ----------
  applyTheme();
  render();
})();
