# GymLog 2.0

A single-page Progressive Web App (PWA) for tracking gym workouts, now upgraded with **Supabase** for secure cloud synchronization, authentication, and persistent storage across devices.

## Features

- **User Authentication**: Secure email & password login via Supabase Auth.
- **Cloud Database**: PostgreSQL database with Row-Level Security (RLS) ensures users can only access their own data.
- **Offline-First Logging**: During a workout, sets are logged locally. You only need to be online when clicking "Save Workout to History" or navigating pages.
- **Progress Tracking**: Automatic volume and max weight charting using Chart.js.
- **Body Measurements**: Track bodyweight, body fat %, and other metrics over time.
- **PWA Ready**: Can be installed to the home screen on iOS and Android.
- **Zero Build Tools**: No React, no Node.js, no Webpack. Built entirely with vanilla HTML, CSS, and ES Modules.

---

## Setup Instructions

### 1. Supabase Setup

1. Create a new project at [Supabase](https://supabase.com/).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the entire contents of `supabase-setup.sql` and run it. This will automatically create all tables, indexes, and RLS policies.
4. Optional: Under **Authentication > Providers > Email**, you may want to disable "Confirm email" during testing to make signup instant.

### 2. Connect the App

1. Rename `.env.example` to `js/config.js` (or just create `js/config.js`).
2. Add your project credentials from **Project Settings > API**:

```javascript
// js/config.js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

*(Note: `js/config.js` is automatically ignored by Git so your credentials stay safe).*

### 3. Run Locally

Because the app uses ES Modules (`<script type="module">`), you cannot simply open `index.html` from the file system. You must run a local web server:

```bash
# Using Python
python3 -m http.server 3000

# OR using Node.js
npx serve
```
Then visit `http://localhost:3000`.

---

## Architecture & Code Structure

The app is broken down into the following vanilla JS modules:

- `index.html` - The static UI shell and modals.
- `styles.css` - All styling, using native CSS variables for themeing.
- `js/app.js` - The main entry point, router, and event orchestrator.
- `js/auth.js` - Handles Supabase authentication state.
- `js/db.js` - All Supabase database queries and mutations.
- `js/cache.js` - In-memory and localStorage cache for instant UI rendering.
- `js/ui.js` - DOM manipulation and data rendering.
- `js/charts.js` - Chart.js integrations.

## Deployment

You can deploy this instantly to **Vercel**, **Netlify**, or **Cloudflare Pages** because it is just static files.
A `vercel.json` is included to handle single-page app routing (rewriting all paths to `index.html`).

Remember to include your `js/config.js` file if deploying via a ZIP upload, or inject the credentials if building via CI/CD.
