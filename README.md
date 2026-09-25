# GymLog — Workout Tracker

> **Track every lift. Beat every session.**

GymLog is an offline-first Progressive Web App (PWA) for tracking gym workouts and body measurements. It features a hybrid architecture that allows you to use the app completely offline as a guest (`localStorage`), or securely log in to sync your data across devices using a cloud backend.

**Live:** [gymlog7.netlify.app](https://gymlog7.netlify.app/)

---

## Features

### Workout Logging
- Create named **workout days** (e.g. Push, Pull, Legs)
- Add **exercises** to each day with custom sets
- Log **weight × reps** per set with inline editing
- Rename or delete days and exercises at any time

### Progress Charts
- Per-exercise **progression charts** powered by [Chart.js](https://www.chartjs.org/)
- Filter history by **month and year**
- Chronological history view beneath each chart

### Body Measurements
- Create custom **measurement types** (e.g. Weight, Waist, Arms)
- Log entries with a **value and unit** (kg, cm, lbs, %, inch, etc.)
- View a dedicated **progress chart** per measurement type
- Month/year filtering on measurement charts

### Hybrid Data Architecture
- **Guest Mode:** Use the app completely offline with all data living securely in the browser's `localStorage`. No account required.
- **Cloud Sync:** Log in securely via Supabase Authentication to back up and synchronize your data across multiple devices.
- **Offline-to-Cloud Migration:** Automatically detects offline data upon login and provides safe, atomic conflict resolution workflows to merge or replace existing cloud data.

### Backup & Restore
- **Offline Data Portability:** Download your entire workout and measurement history as a JSON backup file.
- **Robust Migration System:** Ensures backups from older schema versions automatically migrate to the latest format upon restoring.
- **Safe Imports:** Comprehensive validation checks and atomic database transactions guarantee that a corrupt or incompatible backup never overwrites your existing data.

### PWA — Installable on Mobile
- Add to Home Screen on iOS and Android for a native app feel
- Standalone display mode, portrait orientation locked
- Status bar and splash screen configured for iOS (`apple-mobile-web-app-capable`)
- `manifest.json` with 192 × 512 icons included

### Personalization
- Dark mode by default (`#0a0a0a` background)
- Light/Dark theme toggle persisted across sessions
- Dynamic font-size scaling via global settings

### Browser Navigation
- Full `history.pushState` / `popstate` support — the browser back button works correctly between pages
- Deep-linkable via Netlify redirects (`_redirects`) — all routes fall back to `index.html`

---

## Tech Stack

| Concern | Solution |
|---|---|
| Framework | [React](https://react.dev/) + [Vite](https://vitejs.dev/) |
| Routing | [React Router](https://reactrouter.com/) |
| Backend & Auth | [Supabase](https://supabase.com/) (PostgreSQL + GoTrue) |
| Charts | [Chart.js](https://cdn.jsdelivr.net/npm/chart.js) + react-chartjs-2 |
| Fonts | [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) (display) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) (body) via Google Fonts |
| Local Storage | `localStorage` (Guest Mode) |
| Deployment | [Netlify](https://www.netlify.com/) |
| PWA | Custom vanilla Service Worker (`sw.js`) + `manifest.json` for offline app-shell caching |

---

## Getting Started

### Prerequisites
To run GymLog locally with cloud functionality, you need a Supabase project.

1. Create a [Supabase](https://supabase.com) project.
2. Execute the provided SQL migrations to create the required tables and the `replace_gymlog_data` RPC function.

### Installation
```bash
# Clone the repo
git clone https://github.com/your-username/gymlog.git
cd gymlog

# Install dependencies
npm install
```

### Environment Variables
Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Run Locally
```bash
# Start development server
npm run dev

# Build for production
npm run build
```

Then visit `http://localhost:3000`.

---

## Deployment

The app is deployed on **Netlify**. Push to a connected GitHub repo and Netlify will deploy automatically. The `_redirects` file rewrites all paths to `index.html` so navigation works correctly on refresh or direct URL access.

```text
/* /index.html 200
```

---

## Data Storage

GymLog implements a secure hybrid approach:

- **Guest Mode:** All data is stored in the browser's `localStorage`. Clearing browser storage or uninstalling the PWA will erase all local data.
- **Cloud Mode:** All authenticated data is persisted strictly in the cloud via Supabase PostgreSQL, utilizing Row Level Security (RLS) to ensure absolute data privacy. Local state is kept strictly pessimistic to prevent out-of-sync conflicts.

---

## Roadmap / Known Limitations

- [ ] Workout templates / reusable day blueprints
- [ ] Rest timer
- [ ] Unit preference (kg vs lbs) — currently per-entry

---

## License

MIT
