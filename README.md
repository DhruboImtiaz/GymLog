# GymLog — Workout Tracker

> **Track every lift. Beat every session.**

GymLog is a zero-dependency, single-file Progressive Web App (PWA) for tracking gym workouts and body measurements. It runs entirely in the browser with no server, no account, and no internet connection required after the first load — all data lives in `localStorage`.

---

## Features

### 🏋️ Workout Logging
- Create named **workout days** (e.g. Push, Pull, Legs)
- Add **exercises** to each day with custom sets
- Log **weight × reps** per set with inline editing
- Rename or delete days and exercises at any time

### 📈 Progress Charts
- Per-exercise **progression charts** powered by [Chart.js](https://www.chartjs.org/)
- Filter history by **month and year**
- Chronological history view beneath each chart

### 📏 Body Measurements
- Create custom **measurement types** (e.g. Weight, Waist, Arms)
- Log entries with a **value and unit** (kg, cm, lbs, etc.)
- View a dedicated **progress chart** per measurement type
- Month/year filtering on measurement charts

### 📱 PWA — Installable on Mobile
- Add to Home Screen on iOS and Android for a native app feel
- Standalone display mode, portrait orientation locked
- Status bar and splash screen configured for iOS (`apple-mobile-web-app-capable`)
- `manifest.json` with 192 × 512 icons included

### 🎨 Light / Dark Theme
- Dark mode by default (`#0a0a0a` background)
- One-tap toggle persisted across sessions
- Fully themed via CSS custom properties — no flash on load

### 🧭 Browser Navigation
- Full `history.pushState` / `popstate` support — the browser back button works correctly between pages
- Deep-linkable via Vercel rewrites (`vercel.json`) — all routes fall back to `index.html`

---

## Tech Stack

| Concern | Solution |
|---|---|
| Framework | None — vanilla HTML, CSS, JS |
| Charts | [Chart.js](https://cdn.jsdelivr.net/npm/chart.js) via CDN |
| Fonts | [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) (display) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) (body) via Google Fonts |
| Storage | `localStorage` (no backend) |
| Deployment | [Vercel](https://vercel.com) |
| PWA | `manifest.json` + `<meta>` tags |

---

## Project Structure

```
├── index.html          # Entire app — markup, styles, and JS in one file
├── manifest.json       # PWA manifest (name, icons, display mode)
├── vercel.json         # SPA rewrite rule for Vercel deployment
├── icon-192.png        # PWA icon (192×192)
├── icon-512.png        # PWA icon (512×512)
└── refactor.py         # One-off migration script (Templates → Measurements)
```

---

## Getting Started

No build step required.

```bash
# Clone the repo
git clone https://github.com/your-username/gymlog.git
cd gymlog

# Open directly in a browser
open index.html

# Or serve locally (e.g. with Python)
python3 -m http.server 3000
```

Then visit `http://localhost:3000`.

---

## Deployment

The app is configured for **Vercel** out of the box. Push to a connected GitHub repo and Vercel will deploy automatically. The `vercel.json` rewrites all paths to `index.html` so navigation works correctly on refresh or direct URL access.

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Data Storage

All data is stored in the browser's `localStorage` under a single key as a JSON object with the following shape:

```json
{
  "days": [...],
  "measurements": [...]
}
```

**No data is ever sent to a server.** Clearing browser storage or uninstalling the PWA will erase all data. Consider exporting/backing up data manually if needed (export feature not yet implemented).

---

## Roadmap / Known Limitations

- [ ] Data export / import (JSON or CSV)
- [ ] Workout templates / reusable day blueprints
- [ ] Rest timer
- [ ] Unit preference (kg vs lbs) — currently per-entry
- [ ] Cloud sync / account support
- [ ] No offline caching via Service Worker yet (fonts and Chart.js require internet on first load)

---

## License

MIT
