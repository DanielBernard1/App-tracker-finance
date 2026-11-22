// Simple i18n dictionary: English + Chinese (Simplified)
window.I18N = {
  en: {
    appTitle: "Finance Tracker",

    // Legend
    legConfirmed: "Guaranteed",
    legOptimistic: "+ Potential",
    legGoal: "Goal",
    legBought: "Bought",

    // Columns
    colItems: "Income / Expenses",
    colGoals: "Goals",
    noItems: "No items yet. Tap + to add income or an expense.",
    noGoals: "No goals yet. Tap + to add one.",
    potentialTag: "potential",
    boughtTag: "bought",

    // Goal marker popover
    byDate: "By",
    boughtFlag: "Marked as bought",

    // Item modal
    addItem: "Add income / expense",
    editItem: "Edit item",
    itemPlaceholder: "e.g. Salary, Rent, MacBook…",
    type: "Type",
    income: "Income (+)",
    expense: "Expense (−)",
    recurring: "Repeats monthly",
    potential: "Potential (uncertain)",

    // Goal modal
    addGoal: "Add goal",
    editGoal: "Edit goal",
    goalPlaceholder: "e.g. Trip to Japan, New phone",
    target: "Target amount",
    markBought: "Mark as bought",
    buy: "Bought",
    unbuy: "Un-buy",

    // Accounts
    editAccounts: "Accounts",
    accounts: "Accounts",
    accountName: "Account",
    addAccount: "Add account",
    balance: "Balance",
    startingBalance: "Starting balance",
    noAccounts: "No accounts yet. Add one to set your starting balance.",
    accountPlaceholder: "e.g. Bank, Revolut, Cash",

    // Categories
    editCategories: "Categories",
    categories: "Categories",
    newCategory: "New category",
    addCategory: "Add category",
    noCategories: "No categories yet.",
    categoryPlaceholder: "e.g. Travel, Food",

    // Shared fields
    name: "Name",
    amount: "Amount",
    currency: "Currency",
    category: "Category",
    date: "Date",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    done: "Done",

    // Settings
    settings: "Settings",
    settingsHint: "Data is stored on this device only.",
    loadSample: "Load sample data",
    clearAll: "Clear all data",
    confirmSample: "Replace current data with the sample data?",
    confirmClear: "Delete all data and start empty? This cannot be undone.",
  },
  zh: {
    appTitle: "财务记账",

    legConfirmed: "确定",
    legOptimistic: "+ 潜在",
    legGoal: "目标",
    legBought: "已购买",

    colItems: "收入 / 支出",
    colGoals: "目标",
    noItems: "还没有项目。点击 + 添加收入或支出。",
    noGoals: "还没有目标。点击 + 添加。",
    potentialTag: "潜在",
    boughtTag: "已购买",

    byDate: "截至",
    boughtFlag: "已标记为购买",

    addItem: "添加收入 / 支出",
    editItem: "编辑项目",
    itemPlaceholder: "例如 工资、房租、MacBook…",
    type: "类型",
    income: "收入 (+)",
    expense: "支出 (−)",
    recurring: "每月重复",
    potential: "潜在（不确定）",

    addGoal: "添加目标",
    editGoal: "编辑目标",
    goalPlaceholder: "例如 日本旅行、新手机",
    target: "目标金额",
    markBought: "标记为已购买",
    buy: "已购买",
    unbuy: "取消购买",

    editAccounts: "账户",
    accounts: "账户",
    accountName: "账户",
    addAccount: "添加账户",
    balance: "余额",
    startingBalance: "初始余额",
    noAccounts: "还没有账户。添加一个以设置初始余额。",
    accountPlaceholder: "例如 银行、Revolut、现金",

    editCategories: "类别",
    categories: "类别",
    newCategory: "新类别",
    addCategory: "添加类别",
    noCategories: "还没有类别。",
    categoryPlaceholder: "例如 旅行、餐饮",

    name: "名称",
    amount: "金额",
    currency: "货币",
    category: "类别",
    date: "日期",
    save: "保存",
    cancel: "取消",
    delete: "删除",
    done: "完成",

    settings: "设置",
    settingsHint: "数据仅保存在本设备上。",
    loadSample: "载入示例数据",
    clearAll: "清除所有数据",
    confirmSample: "用示例数据替换当前数据？",
    confirmClear: "删除所有数据并清空？此操作无法撤销。",
  },
};

window.t = function (key) {
  const lang = window.STATE_LANG || "en";
  const dict = window.I18N[lang] || window.I18N.en;
  return dict[key] != null ? dict[key] : (window.I18N.en[key] != null ? window.I18N.en[key] : key);
};
