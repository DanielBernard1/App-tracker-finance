// A small but faithful DOM harness so we can load the REAL app JS in Node,
// render it, simulate user interaction, and assert on the result.
// It implements exactly the DOM surface the app uses.

let idSeq = 0;

class ClassList {
  constructor(el) { this.el = el; }
  _set() { return new Set((this.el.attrs.class || "").split(/\s+/).filter(Boolean)); }
  _write(s) { this.el.attrs.class = [...s].join(" "); }
  add(...c) { const s = this._set(); c.forEach((x) => s.add(x)); this._write(s); }
  remove(...c) { const s = this._set(); c.forEach((x) => s.delete(x)); this._write(s); }
  toggle(c, force) { const s = this._set(); const has = s.has(c); const on = force === undefined ? !has : force; if (on) s.add(c); else s.delete(c); this._write(s); return on; }
  contains(c) { return this._set().has(c); }
}

class El {
  constructor(tag) {
    this.tag = (tag || "div").toLowerCase();
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this._text = null;        // text content when leaf
    this._listeners = {};
    this._uid = ++idSeq;
    this.style = new Proxy({}, { set() { return true; }, get() { return ""; } });
    this.value = "";          // inputs/selects default to empty string (like real DOM)
    this.checked = false;     // for checkboxes
    this.type = "";
  }
  get classList() { return new ClassList(this); }
  get className() { return this.attrs.class || ""; }
  set className(v) { this.attrs.class = v; }
  get id() { return this.attrs.id || ""; }
  set id(v) { this.attrs.id = v; }
  get name() { return this.attrs.name; }

  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "type") this.type = String(v);
    if (k === "value") this.value = String(v);
    if (k === "checked") this.checked = true;
  }
  getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }

  get textContent() {
    if (this._text != null) return this._text;
    return this.children.map((c) => (c instanceof El ? c.textContent : String(c))).join("");
  }
  set textContent(v) { this._text = String(v); this.children = []; }

  set innerHTML(html) {
    this.children = [];
    this._text = null;
    if (html === "") return;
    const frag = parseHTML(String(html));
    frag.forEach((n) => this.appendChild(n));
  }
  get innerHTML() { return this.children.map(serialize).join(""); }

  appendChild(node) {
    if (node instanceof DocumentFragment) { node.children.slice().forEach((c) => this.appendChild(c)); return node; }
    node.parent = this;
    this._text = null;
    this.children.push(node);
    return node;
  }
  removeChild(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); return node; }
  remove() { if (this.parent) this.parent.removeChild(this); }

  get firstElementChild() { return this.children.find((c) => c instanceof El) || null; }
  get children_() { return this.children; }

  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { const a = this._listeners[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  dispatch(type, evt) {
    evt = evt || {};
    evt.target = evt.target || this;
    evt.stopPropagation = evt.stopPropagation || (() => { evt._stopped = true; });
    evt.preventDefault = evt.preventDefault || (() => {});
    // capture-ish: fire on this element
    (this._listeners[type] || []).slice().forEach((fn) => fn(evt));
    // bubble to parents
    let p = this.parent;
    while (p && !evt._stopped) { (p._listeners[type] || []).slice().forEach((fn) => fn(evt)); p = p.parent; }
  }
  // convenience for tests
  click() { this.dispatch("click", { target: this }); }

  getBoundingClientRect() { return { left: 0, top: 0, right: 360, bottom: 320, width: 360, height: 320 }; }
  get clientWidth() { return 360; }
  get offsetWidth() { return 150; }

  _walk(fn) { fn(this); this.children.forEach((c) => { if (c instanceof El) c._walk(fn); }); }

  querySelector(sel) { let found = null; this._descendants().some((e) => { if (matchSel(e, sel)) { found = e; return true; } return false; }); return found; }
  querySelectorAll(sel) { return this._descendants().filter((e) => matchSel(e, sel)); }
  _descendants() { const out = []; this.children.forEach((c) => { if (c instanceof El) { out.push(c); out.push(...c._descendants()); } }); return out; }
}

class DocumentFragment {
  constructor() { this.children = []; }
  appendChild(n) { this.children.push(n); return n; }
  get firstElementChild() { return this.children.find((c) => c instanceof El) || null; }
}

// A <template> element: setting innerHTML populates `.content` (a fragment).
class TemplateEl extends El {
  constructor() { super("template"); this.content = new DocumentFragment(); }
  set innerHTML(html) {
    this.content = new DocumentFragment();
    parseHTML(String(html)).forEach((n) => { if (n instanceof El) this.content.appendChild(n); });
  }
  get innerHTML() { return this.content.children.map(serialize).join(""); }
}

// ---- tiny HTML parser (handles the well-formed snippets the app produces) ----
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "circle", "line", "path", "polyline", "rect", "use", "stop"]);
function parseHTML(html) {
  const nodes = [];
  const stack = [];
  let i = 0;
  const push = (node) => { if (stack.length) stack[stack.length - 1].appendChild(node); else nodes.push(node); };
  while (i < html.length) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) { const end = html.indexOf("-->", i); i = end === -1 ? html.length : end + 3; continue; }
      if (html[i + 1] === "/") {
        const end = html.indexOf(">", i);
        stack.pop();
        i = end + 1;
        continue;
      }
      const end = html.indexOf(">", i);
      let tagContent = html.slice(i + 1, end);
      let selfClose = false;
      if (tagContent.endsWith("/")) { selfClose = true; tagContent = tagContent.slice(0, -1); }
      const sp = tagContent.search(/\s/);
      const tag = (sp === -1 ? tagContent : tagContent.slice(0, sp)).trim();
      const el = new El(tag);
      if (sp !== -1) parseAttrs(tagContent.slice(sp), el);
      push(el);
      if (!selfClose && !VOID.has(tag.toLowerCase())) stack.push(el);
      i = end + 1;
    } else {
      const next = html.indexOf("<", i);
      const text = html.slice(i, next === -1 ? html.length : next);
      if (text.trim()) {
        const t = decode(text);
        if (stack.length) { stack[stack.length - 1].appendChild(makeText(t)); }
        else nodes.push(makeText(t));
      }
      i = next === -1 ? html.length : next;
    }
  }
  return nodes;
}
function makeText(t) { const e = new El("#text"); e._text = t; e._isText = true; return e; }
function parseAttrs(str, el) {
  const re = /([a-zA-Z0-9:_-]+)(?:\s*=\s*"([^"]*)")?/g;
  let m;
  while ((m = re.exec(str))) { if (!m[1]) continue; el.setAttribute(m[1], m[2] == null ? "" : m[2]); }
}
function decode(s) { return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'); }
function serialize(n) { if (n._isText) return n._text; let a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join(""); return `<${n.tag}${a}>${n.children.map(serialize).join("")}</${n.tag}>`; }

// ---- selector matching: supports tag, .class, #id, [attr], [attr="v"], tag[attr="v"] ----
function matchSel(el, sel) {
  sel = sel.trim();
  // split compound like input[type="checkbox"]
  const m = sel.match(/^([a-zA-Z0-9]+)?((?:[.#][\w-]+|\[[^\]]+\])*)$/);
  if (!m) return false;
  if (m[1] && el.tag !== m[1].toLowerCase()) return false;
  const rest = m[2] || "";
  const partRe = /([.#][\w-]+)|\[([^\]]+)\]/g;
  let p;
  while ((p = partRe.exec(rest))) {
    if (p[1]) {
      if (p[1][0] === ".") { if (!el.classList.contains(p[1].slice(1))) return false; }
      else { if (el.id !== p[1].slice(1)) return false; }
    } else if (p[2]) {
      const am = p[2].match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/);
      if (!am) return false;
      const val = el.getAttribute(am[1]);
      if (am[2] == null) { if (val == null) return false; }
      else { if (val !== am[2]) return false; }
    }
  }
  return true;
}

// ---- document / window / globals ----
export function makeDocument() {
  const doc = {
    documentElement: new El("html"),
    _byId: {},
    getElementById(id) { return this._byId[id] || null; },
    register(el) { if (el.id) this._byId[el.id] = el; },
    createElement(tag) { return tag.toLowerCase() === "template" ? new TemplateEl() : new El(tag); },
    createElementNS(ns, tag) { return new El(tag); },
    querySelectorAll(sel) { return this.body ? this.body.querySelectorAll(sel) : []; },
    body: new El("body"),
  };
  return doc;
}

export { El, parseHTML, matchSel };
