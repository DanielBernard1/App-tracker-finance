# Finance Tracker — Phase 1

A minimal, clean, dark-mode **offline** personal finance tracker. Everything is entered
manually and stored **on the device** (browser `localStorage`). No account, no internet
required. Installable on iPhone and Android as a home-screen app (PWA).

## Features (Phase 1)

- **Overview** — "available next month" (income + expected − fix costs − pay-later due),
  key figures, goal progress, total expenses.
- **Income** — recurring *income streams* (Dad, Dynasty, Raku, SAP, Candella…) and
  *potential / expected income*.
- **Goals** — target amount, current saved, optional deadline, with progress and a
  "per month needed" estimate.
- **Expenses** — recurring *fix costs* and *pay later* (single future lump sums with a
  due date, factored into the overview until marked paid).
- **History** — logged purchases and a running total.
- **Languages** — English and 中文 (switch in the top-right).
- **Currencies** — EUR and USD, selectable per entry.

## Run it locally

It's plain static files — no build step. Serve the folder over HTTP (service workers
need `http`/`https`, not `file://`):

```bash
# any static server works, e.g.
python3 -m http.server 8080
# then open http://localhost:8080
```

## Host it (GitHub Pages)

Push to the repo, then in **Settings → Pages**, set the source to the `main` branch
(root). The app will be served at `https://<user>.github.io/App-tracker-finance/`.
Open it on the iPhone in Safari → Share → **Add to Home Screen** to install.

## File overview

| File | Purpose |
|---|---|
| `index.html` | app shell, tab bar, service-worker registration |
| `styles.css` | dark theme + layout |
| `app.js` | state, rendering, add/edit modals, overview math |
| `store.js` | `localStorage` persistence |
| `i18n.js` | English + Chinese strings |
| `manifest.webmanifest` | PWA metadata (installable) |
| `sw.js` | service worker (offline cache) |
| `make-icons.mjs` | regenerates `icon-192.png` / `icon-512.png` |

## Notes & next steps

- **Multi-currency**: in Phase 1 amounts are summed as entered (no FX conversion).
  If EUR and USD entries are mixed, overview totals add the raw numbers. FX conversion
  can be added later.
- **Phase 2**: optional backup/sync to a self-hosted server (export + sync endpoint).

## Data & privacy

All data lives in the browser on the device. Clearing site data / browser storage
removes it. An export + server-backup option is planned for Phase 2.
