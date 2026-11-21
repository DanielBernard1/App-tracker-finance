(function () {
  "use strict";

  let state = window.Store.load();
  // Seed sample data on first ever load (empty + never seeded).
  if (!state.seeded && !state.incomeStreams.length && !state.accounts.length) {
    state = window.Store.seed();
    window.Store.save(state);
  }
  window.STATE_LANG = state.lang;
  let activeTab = "overview";

  const view = document.getElementById("view");
  const modalRoot = document.getElementById("modal-root");

  // ---------- helpers ----------
  const CURRENCIES = ["EUR", "USD"];
  const CURRENCY_SYMBOL = { EUR: "€", USD: "$" };

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function money(amount, currency) {
    const cur = currency || state.baseCurrency;
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 2,
      }).format(amount || 0);
    } catch (e) {
      return (CURRENCY_SYMBOL[cur] || "") + (amount || 0).toFixed(2);
    }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  }

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  function monthsUntil(iso) {
    if (!iso) return null;
    const now = new Date();
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return null;
    const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
    return Math.max(0, months) + 1; // include current month
  }

  function persist() {
    window.Store.save(state);
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- overview math ----------
  // Note: multi-currency totals are summed numerically in the base currency label.
  // (No FX conversion in Phase 1 — amounts are added as entered.)
  function sumAmount(list) {
    return list.reduce((s, x) => s + num(x.amount), 0);
  }

  function overviewTotals() {
    const income = sumAmount(state.incomeStreams);
    const expected = sumAmount(state.expectedIncome);
    const fix = sumAmount(state.fixCosts);
    const payLaterDue = state.payLater.filter((p) => !p.paid).reduce((s, p) => s + num(p.amount), 0);
    const available = income + expected - fix - payLaterDue;
    const totalPurchases = sumAmount(state.purchases);
    return { income, expected, fix, payLaterDue, available, totalPurchases };
  }

  // ---------- rendering ----------
  function render() {
    applyStaticI18n();
    document.querySelectorAll(".tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === activeTab)
    );
    const map = {
      overview: renderOverview,
      income: renderIncome,
      goals: renderGoals,
      expenses: renderExpenses,
      history: renderHistory,
    };
    view.innerHTML = "";
    (map[activeTab] || renderOverview)();
    view.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function applyStaticI18n() {
    document.documentElement.lang = state.lang === "zh" ? "zh" : "en";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
  }

  function listCard(items, renderRow, emptyKey) {
    const card = el('<div class="card"></div>');
    if (!items.length) {
      card.appendChild(el(`<div class="empty">${esc(t(emptyKey))}</div>`));
      return card;
    }
    items.forEach((item) => card.appendChild(renderRow(item)));
    return card;
  }

  function addHeader(titleKey, onAdd) {
    const head = el(`<div class="add-head"><h2>${esc(t(titleKey))}</h2></div>`);
    const btn = el(`<button class="btn sm">+ ${esc(t("edit") === "Edit" ? "Add" : "添加")}</button>`);
    btn.textContent = "+";
    btn.setAttribute("aria-label", "add");
    btn.addEventListener("click", onAdd);
    head.appendChild(btn);
    return head;
  }

  // ----- Overview = cash-flow timeline -----
  function renderOverview() {
    const series = window.Projection.project(state, { horizonDays: 730 });

    // Header: starting balance + end-of-horizon projection
    const endConfirmed = series.confirmed[series.confirmed.length - 1];
    const header = el(`
      <div class="card tl-header">
        <div class="kpi kpi-sm">
          <span class="kpi-label">${esc(t("startingBalance"))}</span>
          <span class="kpi-value">${esc(money(series.startingBalance))}</span>
        </div>
      </div>`);
    const editAcc = el(`<button class="btn ghost sm">${esc(t("editAccounts"))}</button>`);
    editAcc.addEventListener("click", openAccountsModal);
    header.appendChild(editAcc);
    view.appendChild(header);

    // Chart
    const chartWrap = el('<div class="card timeline-card"></div>');
    const chartHost = el('<div class="timeline-host"></div>');
    chartWrap.appendChild(chartHost);
    view.appendChild(chartWrap);

    // Render after insertion so clientWidth is known
    requestAnimationFrame(() => {
      window.Chart.render(chartHost, series, (v) => money(v), (iso) => fmtDate(iso), state.lang);
    });

    // Legend
    view.appendChild(el(`
      <div class="legend">
        <span class="lg"><i class="sw sw-confirmed"></i>${esc(t("legConfirmed"))}</span>
        <span class="lg"><i class="sw sw-optimistic"></i>${esc(t("legOptimistic"))}</span>
        <span class="lg"><i class="dot dot-income"></i>${esc(t("legIncome"))}</span>
        <span class="lg"><i class="dot dot-fix"></i>${esc(t("legFix"))}</span>
        <span class="lg"><i class="dot dot-pay"></i>${esc(t("legPayLater"))}</span>
        <span class="lg"><i class="dot dot-exp"></i>${esc(t("legExpected"))}</span>
      </div>`));

    // Quick projection readouts at 1 / 3 / 6 / 12 months
    const marks = [
      { d: 30, key: "in1mo" },
      { d: 90, key: "in3mo" },
      { d: 180, key: "in6mo" },
      { d: 365, key: "in12mo" },
    ];
    view.appendChild(el(`<div class="section-title">${esc(t("projectedBalance"))}</div>`));
    const grid = el('<div class="kpi-grid"></div>');
    marks.forEach((m) => {
      const c = series.confirmed[m.d] != null ? series.confirmed[m.d] : endConfirmed;
      grid.appendChild(el(`
        <div class="card kpi-sm">
          <div class="kpi">
            <span class="kpi-label">${esc(t(m.key))}</span>
            <span class="kpi-value ${c >= 0 ? "pos" : "neg"}">${esc(money(c))}</span>
          </div>
        </div>`));
    });
    view.appendChild(grid);
  }

  // ----- Accounts editor (starting balance = sum of accounts) -----
  function openAccountsModal() {
    const card = el('<div class="card" style="margin:0 0 12px"></div>');
    function redraw() {
      card.innerHTML = "";
      if (!state.accounts.length) {
        card.appendChild(el(`<div class="empty">${esc(t("noAccounts"))}</div>`));
      }
      state.accounts.forEach((a) => {
        const row = el(`
          <div class="row">
            <div class="row-main">
              <span class="row-title">${esc(a.name)}</span>
            </div>
            <div class="row-right">
              <span class="row-amount">${esc(money(a.balance, a.currency))}</span>
              <button class="icon-btn" aria-label="delete">×</button>
            </div>
          </div>`);
        row.querySelector(".icon-btn").addEventListener("click", () => {
          state.accounts = state.accounts.filter((z) => z.id !== a.id);
          persist(); redraw();
        });
        card.appendChild(row);
      });
      const total = state.accounts.reduce((s, a) => s + num(a.balance), 0);
      card.appendChild(el(`<div class="row" style="border:none"><div class="row-main"><span class="row-sub">${esc(t("startingBalance"))}</span></div><span class="row-amount">${esc(money(total))}</span></div>`));
    }
    redraw();

    const addForm = el(`
      <form id="acc-form">
        <div class="field-row">
          <div class="field" style="flex:1.4"><label>${esc(t("accountName"))}</label><input name="name" type="text" placeholder="${esc(t("accountPlaceholder"))}" /></div>
          <div class="field"><label>${esc(t("balance"))}</label><input name="balance" type="number" inputmode="decimal" step="0.01" placeholder="0.00" /></div>
          <div class="field" style="flex:0 0 84px"><label>${esc(t("currency"))}</label><select name="currency">${currencyOptions()}</select></div>
        </div>
        <button type="button" class="btn ghost sm block" id="acc-add">+ ${esc(t("addAccount"))}</button>
      </form>`);

    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`<div class="modal"><h2>${esc(t("accounts"))}</h2></div>`);
    modal.appendChild(card);
    modal.appendChild(addForm);
    const actions = el(`<div class="modal-actions"><button type="button" class="btn block" id="acc-done">${esc(t("done"))}</button></div>`);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) { closeModal(); render(); } });

    addForm.querySelector("#acc-add").addEventListener("click", () => {
      const f = addForm;
      const name = f.name.value.trim();
      const bal = num(f.balance.value);
      if (!name) return;
      state.accounts.push({ id: Store.uid(), name, balance: bal, currency: f.currency.value });
      persist();
      f.name.value = ""; f.balance.value = "";
      redraw();
    });
    actions.querySelector("#acc-done").addEventListener("click", () => { closeModal(); render(); });

    modalRoot.innerHTML = "";
    modalRoot.appendChild(backdrop);
  }

  // ----- Income -----
  function renderIncome() {
    view.appendChild(addHeader("incomeStreams", () => openIncomeStreamModal()));
    view.appendChild(listCard(state.incomeStreams, incomeStreamRow, "noIncomeStreams"));

    view.appendChild(el(`<div class="section-title">${esc(t("potentialIncome"))}</div>`));
    const head2 = addHeader("potentialIncome", () => openExpectedModal());
    head2.querySelector("h2").remove(); // section title already shown
    view.appendChild(head2);
    view.appendChild(listCard(state.expectedIncome, expectedRow, "noExpected"));
  }

  function incomeStreamRow(item) {
    const row = el(`
      <div class="row">
        <div class="row-main">
          <span class="row-title">${esc(item.name)}</span>
          ${item.note ? `<span class="row-sub">${esc(item.note)}</span>` : ""}
        </div>
        <div class="row-right">
          <span class="row-amount pos">${esc(money(item.amount, item.currency))} ${esc(t("perMonth"))}</span>
        </div>
      </div>`);
    row.addEventListener("click", () => openIncomeStreamModal(item));
    return row;
  }

  function expectedRow(item) {
    const row = el(`
      <div class="row">
        <div class="row-main">
          <span class="row-title">${esc(item.name)}</span>
          <span class="row-sub">${item.date ? esc(fmtDate(item.date)) : ""}${item.note ? (item.date ? " · " : "") + esc(item.note) : ""}</span>
        </div>
        <div class="row-right">
          <span class="row-amount pos">${esc(money(item.amount, item.currency))}</span>
        </div>
      </div>`);
    row.addEventListener("click", () => openExpectedModal(item));
    return row;
  }

  // ----- Goals -----
  function renderGoals() {
    view.appendChild(addHeader("monetaryGoals", () => openGoalModal()));
    if (!state.goals.length) {
      view.appendChild(el(`<div class="card"><div class="empty">${esc(t("noGoals"))}</div></div>`));
      return;
    }
    state.goals.forEach((g) => view.appendChild(goalCard(g)));
  }

  function goalCard(g) {
    const target = num(g.target);
    const saved = num(g.saved);
    const remaining = Math.max(0, target - saved);
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    const done = target > 0 && saved >= target;
    const months = monthsUntil(g.deadline);
    const perMonth = months && remaining > 0 ? remaining / months : 0;

    const card = el('<div class="card"></div>');
    card.appendChild(el(`
      <div class="row" style="padding-top:0;border:none">
        <div class="row-main">
          <span class="row-title">${esc(g.name)}</span>
          <span class="row-sub">${esc(t("deadline"))}: ${g.deadline ? esc(fmtDate(g.deadline)) : esc(t("noDeadline"))}</span>
        </div>
        <span class="chip ${done ? "" : "muted"}">${done ? esc(t("reached")) : pct + "%"}</span>
      </div>`));
    card.appendChild(el(`<div class="progress ${done ? "done" : ""}"><span style="width:${pct}%"></span></div>`));
    card.appendChild(el(`
      <div class="row" style="border:none;padding-bottom:0">
        <div class="row-main">
          <span class="row-sub">${esc(t("saved"))}: ${esc(money(saved, g.currency))} / ${esc(t("target"))}: ${esc(money(target, g.currency))}</span>
          <span class="row-sub">${done ? "" : esc(money(remaining, g.currency)) + " " + esc(t("remaining")) + (perMonth > 0 && months ? " · " + esc(money(perMonth, g.currency)) + " " + esc(t("perMonthNeeded")) : "")}</span>
        </div>
      </div>`));
    const edit = el(`<button class="btn ghost sm" style="margin-top:10px">${esc(t("edit"))}</button>`);
    edit.addEventListener("click", () => openGoalModal(g));
    card.appendChild(edit);
    return card;
  }

  // ----- Expenses -----
  function renderExpenses() {
    view.appendChild(addHeader("fixCosts", () => openFixCostModal()));
    view.appendChild(listCard(state.fixCosts, fixCostRow, "noFixCosts"));

    view.appendChild(el(`<div class="section-title">${esc(t("payLater"))}</div>`));
    const head = addHeader("payLater", () => openPayLaterModal());
    head.querySelector("h2").remove();
    view.appendChild(head);
    view.appendChild(listCard(state.payLater, payLaterRow, "noPayLater"));
  }

  function fixCostRow(item) {
    const row = el(`
      <div class="row">
        <div class="row-main">
          <span class="row-title">${esc(item.name)}</span>
          ${item.note ? `<span class="row-sub">${esc(item.note)}</span>` : ""}
        </div>
        <span class="row-amount neg">${esc(money(item.amount, item.currency))} ${esc(t("perMonth"))}</span>
      </div>`);
    row.addEventListener("click", () => openFixCostModal(item));
    return row;
  }

  function payLaterRow(item) {
    const overdue = item.dueDate && !item.paid && item.dueDate < todayISO();
    const row = el(`
      <div class="row">
        <div class="row-main">
          <span class="row-title">${esc(item.name)}</span>
          <span class="row-sub">${esc(t("due"))}: ${item.dueDate ? esc(fmtDate(item.dueDate)) : "—"}</span>
        </div>
        <div class="row-right">
          <span class="chip ${item.paid ? "" : overdue ? "warn" : "muted"}">${item.paid ? esc(t("paid")) : overdue ? esc(t("due")) : esc(t("payLater"))}</span>
          <span class="row-amount neg">${esc(money(item.amount, item.currency))}</span>
        </div>
      </div>`);
    row.addEventListener("click", () => openPayLaterModal(item));
    return row;
  }

  // ----- History -----
  function renderHistory() {
    const o = overviewTotals();
    view.appendChild(el(`
      <div class="card">
        <div class="kpi kpi-sm">
          <span class="kpi-label">${esc(t("totalExpenses"))}</span>
          <span class="kpi-value neg">${esc(money(o.totalPurchases))}</span>
        </div>
      </div>`));
    view.appendChild(addHeader("purchaseHistory", () => openPurchaseModal()));
    const sorted = [...state.purchases].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    view.appendChild(listCard(sorted, purchaseRow, "noPurchases"));
  }

  function purchaseRow(item) {
    const row = el(`
      <div class="row">
        <div class="row-main">
          <span class="row-title">${esc(item.name)}</span>
          <span class="row-sub">${item.date ? esc(fmtDate(item.date)) : ""}${item.category ? (item.date ? " · " : "") + esc(item.category) : ""}</span>
        </div>
        <span class="row-amount neg">${esc(money(item.amount, item.currency))}</span>
      </div>`);
    row.addEventListener("click", () => openPurchaseModal(item));
    return row;
  }

  // ---------- modals ----------
  function closeModal() {
    modalRoot.innerHTML = "";
  }

  function currencyOptions(selected) {
    return CURRENCIES.map(
      (c) => `<option value="${c}" ${c === (selected || state.baseCurrency) ? "selected" : ""}>${c}</option>`
    ).join("");
  }

  function openModal(titleKey, fieldsHtml, onSave, existing) {
    const backdrop = el('<div class="modal-backdrop"></div>');
    const modal = el(`
      <div class="modal">
        <h2>${esc(t(titleKey))}</h2>
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
      form.querySelectorAll("[name]").forEach((f) => {
        data[f.name] = f.type === "checkbox" ? f.checked : f.value.trim();
      });
      if (onSave(data) !== false) {
        persist();
        closeModal();
        render();
      }
    });
    const del = modal.querySelector("#m-del");
    if (del) del.addEventListener("click", () => { existing._delete(); persist(); closeModal(); render(); });
    modalRoot.innerHTML = "";
    modalRoot.appendChild(backdrop);
    const first = modal.querySelector("input, select, textarea");
    if (first) setTimeout(() => first.focus(), 50);
  }

  function field(labelKey, name, type, value, placeholder, extra) {
    return `
      <div class="field">
        <label>${esc(t(labelKey))}${extra === "optional" ? ' <span style="opacity:.6">(' + esc(t("optional")) + ')</span>' : ""}</label>
        <input name="${name}" type="${type}" value="${esc(value == null ? "" : value)}" placeholder="${esc(placeholder || "")}" ${type === "number" ? 'inputmode="decimal" step="0.01"' : ""} />
      </div>`;
  }

  function amountCurrencyRow(amount, currency) {
    return `
      <div class="field-row">
        <div class="field">
          <label>${esc(t("amount"))}</label>
          <input name="amount" type="number" inputmode="decimal" step="0.01" value="${esc(amount == null ? "" : amount)}" placeholder="0.00" />
        </div>
        <div class="field" style="flex:0 0 110px">
          <label>${esc(t("currency"))}</label>
          <select name="currency">${currencyOptions(currency)}</select>
        </div>
      </div>`;
  }

  function removeFrom(listName, id) {
    state[listName] = state[listName].filter((x) => x.id !== id);
  }

  // Income stream
  function openIncomeStreamModal(item) {
    const existing = item ? { _delete: () => removeFrom("incomeStreams", item.id) } : null;
    const fields =
      field("name", "name", "text", item && item.name, t("namePlaceholder")) +
      amountCurrencyRow(item && item.amount, item && item.currency) +
      field("note", "note", "text", item && item.note, "", "optional");
    openModal("addIncomeStream", fields, (d) => {
      if (!d.name) return false;
      if (item) Object.assign(item, { name: d.name, amount: num(d.amount), currency: d.currency, note: d.note });
      else state.incomeStreams.push({ id: Store.uid(), name: d.name, amount: num(d.amount), currency: d.currency, note: d.note });
    }, existing);
  }

  // Expected income
  function openExpectedModal(item) {
    const existing = item ? { _delete: () => removeFrom("expectedIncome", item.id) } : null;
    const fields =
      field("name", "name", "text", item && item.name, t("namePlaceholder")) +
      amountCurrencyRow(item && item.amount, item && item.currency) +
      field("date", "date", "date", item ? item.date : todayISO(), "", "optional") +
      field("note", "note", "text", item && item.note, "", "optional");
    openModal("addExpected", fields, (d) => {
      if (!d.name) return false;
      if (item) Object.assign(item, { name: d.name, amount: num(d.amount), currency: d.currency, date: d.date, note: d.note });
      else state.expectedIncome.push({ id: Store.uid(), name: d.name, amount: num(d.amount), currency: d.currency, date: d.date, note: d.note });
    }, existing);
  }

  // Goal
  function openGoalModal(item) {
    const existing = item ? { _delete: () => removeFrom("goals", item.id) } : null;
    const fields =
      field("name", "name", "text", item && item.name, t("goalNamePlaceholder")) +
      `<div class="field-row">
        <div class="field"><label>${esc(t("target"))}</label><input name="target" type="number" inputmode="decimal" step="0.01" value="${esc(item ? item.target : "")}" placeholder="0.00" /></div>
        <div class="field"><label>${esc(t("saved"))}</label><input name="saved" type="number" inputmode="decimal" step="0.01" value="${esc(item ? item.saved : "")}" placeholder="0.00" /></div>
      </div>` +
      `<div class="field-row">
        <div class="field" style="flex:0 0 110px"><label>${esc(t("currency"))}</label><select name="currency">${currencyOptions(item && item.currency)}</select></div>
        <div class="field"><label>${esc(t("deadline"))} <span style="opacity:.6">(${esc(t("optional"))})</span></label><input name="deadline" type="date" value="${esc(item && item.deadline ? item.deadline : "")}" /></div>
      </div>` +
      field("note", "note", "text", item && item.note, "", "optional");
    openModal("addGoal", fields, (d) => {
      if (!d.name) return false;
      const payload = { name: d.name, target: num(d.target), saved: num(d.saved), currency: d.currency, deadline: d.deadline, note: d.note };
      if (item) Object.assign(item, payload);
      else state.goals.push(Object.assign({ id: Store.uid() }, payload));
    }, existing);
  }

  // Fix cost
  function openFixCostModal(item) {
    const existing = item ? { _delete: () => removeFrom("fixCosts", item.id) } : null;
    const fields =
      field("name", "name", "text", item && item.name, t("namePlaceholder")) +
      amountCurrencyRow(item && item.amount, item && item.currency) +
      field("note", "note", "text", item && item.note, "", "optional");
    openModal("addFixCost", fields, (d) => {
      if (!d.name) return false;
      if (item) Object.assign(item, { name: d.name, amount: num(d.amount), currency: d.currency, note: d.note });
      else state.fixCosts.push({ id: Store.uid(), name: d.name, amount: num(d.amount), currency: d.currency, note: d.note });
    }, existing);
  }

  // Pay later
  function openPayLaterModal(item) {
    const existing = item ? { _delete: () => removeFrom("payLater", item.id) } : null;
    const fields =
      field("name", "name", "text", item && item.name, t("namePlaceholder")) +
      amountCurrencyRow(item && item.amount, item && item.currency) +
      field("dueDate", "dueDate", "date", item ? item.dueDate : todayISO()) +
      `<div class="field"><label><input name="paid" type="checkbox" ${item && item.paid ? "checked" : ""} style="width:auto;margin-right:8px"> ${esc(t("paid"))}</label></div>` +
      field("note", "note", "text", item && item.note, "", "optional");
    openModal("addPayLater", fields, (d) => {
      if (!d.name) return false;
      const payload = { name: d.name, amount: num(d.amount), currency: d.currency, dueDate: d.dueDate, paid: !!d.paid, note: d.note };
      if (item) Object.assign(item, payload);
      else state.payLater.push(Object.assign({ id: Store.uid() }, payload));
    }, existing);
  }

  // Purchase
  function openPurchaseModal(item) {
    const existing = item ? { _delete: () => removeFrom("purchases", item.id) } : null;
    const fields =
      field("name", "name", "text", item && item.name, t("purchasePlaceholder")) +
      amountCurrencyRow(item && item.amount, item && item.currency) +
      `<div class="field-row">
        <div class="field"><label>${esc(t("date"))}</label><input name="date" type="date" value="${esc(item ? item.date : todayISO())}" /></div>
        <div class="field"><label>${esc(t("category"))} <span style="opacity:.6">(${esc(t("optional"))})</span></label><input name="category" type="text" value="${esc(item && item.category || "")}" /></div>
      </div>` +
      field("note", "note", "text", item && item.note, "", "optional");
    openModal("addPurchase", fields, (d) => {
      if (!d.name) return false;
      const payload = { name: d.name, amount: num(d.amount), currency: d.currency, date: d.date, category: d.category, note: d.note };
      if (item) Object.assign(item, payload);
      else state.purchases.push(Object.assign({ id: Store.uid() }, payload));
    }, existing);
  }

  // ---------- events ----------
  document.getElementById("tabbar").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    render();
  });

  const langSelect = document.getElementById("lang-select");
  langSelect.value = state.lang;
  langSelect.addEventListener("change", () => {
    state.lang = langSelect.value;
    window.STATE_LANG = state.lang;
    persist();
    render();
  });

  // ---------- init ----------
  render();
})();
