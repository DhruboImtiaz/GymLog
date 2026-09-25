# GymLog — The Hybrid Offline-First Workout Tracker

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **Track every lift. Beat every session. Anytime, anywhere.**

GymLog is an offline-first Progressive Web App (PWA) for tracking gym workouts and body measurements. It features a **hybrid architecture** that allows you to use the app completely offline as a guest (`localStorage`), or seamlessly log in to sync your data securely across devices via **Supabase**.

**Live:** [gymlog7.netlify.app](https://gymlog7.netlify.app/)

---

## ⚡ Features

### 🏋️‍♂️ Workout & Measurement Logging
- **Custom Routines:** Create named workout days (e.g., Push, Pull, Legs) and add exercises.
- **Set Tracking:** Log weight × reps per set with instant inline editing.
- **Body Measurements:** Track custom metrics (Weight, Waist, Arms) with specific units (kg, lbs, cm, %, etc.).

### 📊 Progress Charts
- **Visual Analytics:** Interactive per-exercise and per-measurement progression charts powered by [Chart.js](https://www.chartjs.org/).
- **Chronological History:** Detailed historical logs beneath each chart, filterable by month and year.

### ☁️ Hybrid Data Architecture (Guest & Cloud)
- **Guest Mode:** Works 100% offline using `localStorage` immediately upon load. No account required.
- **Cloud Sync:** Log in with Supabase Authentication to automatically sync data across all your devices.
- **Smart Conflict Resolution:** If you create data offline and later log in, GymLog detects conflicts and safely guides you through merging or replacing data.
- **Atomic Operations:** Cloud restores utilize ACID-compliant PostgreSQL RPCs (`replace_gymlog_data`) to guarantee data integrity.

### 💾 Backup & Restore
- **Data Portability:** Download your entire workout history as a structured JSON backup.
- **Deep Validation:** Restoring backups validates data boundaries (preventing impossible dates or malformed schemas) before mutating state.
- **Backward Compatibility:** Legacy backups are automatically migrated to the newest schema format upon restoration.

### 📱 PWA — Native Mobile Experience
- **Installable:** Add to Home Screen on iOS and Android for a seamless app-shell experience.
- **Offline Ready:** Custom Service Worker (`sw.js`) caches the application shell.
- **Deep Linking:** Full `history.pushState` routing allows standard URL sharing and navigation.

### 🎨 Personalization
- **Themes:** Persistent Light & Dark modes.
- **Accessibility:** Dynamic font-size scaling via global settings.

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| **Frontend** | [React](https://react.dev/) + [Vite](https://vitejs.dev/) + React Router |
| **Backend & Auth** | [Supabase](https://supabase.com/) (PostgreSQL, GoTrue Auth) |
| **Charts** | [Chart.js](https://www.chartjs.org/) + react-chartjs-2 |
| **Fonts** | Bebas Neue (Display) + DM Sans (Body) |
| **Hosting** | Vercel / Netlify |

---

## 🚀 Getting Started

### Prerequisites
To run GymLog locally with cloud functionality, you need a [Supabase](https://supabase.com) project. 

1. Create a Supabase project.
2. Execute the SQL migrations to create the `workout_days`, `exercises`, `active_sets`, `workout_history`, `measurements`, and `measurement_entries` tables, along with the `replace_gymlog_data` RPC function.

### Installation

```bash
# Clone the repository
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

Visit `http://localhost:3000` to start lifting.

---

## 📁 Architecture Overview

GymLog manages state strictly via React Contexts, utilizing a pessimistic update strategy for cloud mutations to guarantee database consistency before updating the UI.

- `DataContext.jsx`: The global orchestrator for data fetching and CRUD mutations.
- `MigrationContext.jsx`: Handles the state machine for local-to-cloud data synchronization and conflict resolution.
- `AuthContext.jsx`: Manages the Supabase user session lifecycle.
- `repository.js`: The strict boundary for all Supabase API and RPC interactions.

---

## 📝 Roadmap

- [ ] **Workout Templates:** Reusable blueprints for quick day generation.
- [ ] **Rest Timer:** In-app timer for tracking recovery between sets.
- [ ] **Global Unit Preferences:** Unified global toggle for kg vs lbs.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
