# GymLog Migration Walkthrough

## Phase 13 — Supabase Migration: Stage 1 (Auth Foundation)

### Architecture
- **Supabase Client:** Created `src/lib/supabaseClient.js` initialized with Vite environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
- **Auth State Management:** Created `src/context/AuthContext.jsx` exposing `useAuth` hook (`user`, `session`, `signUp`, `signIn`, `signOut`, `resetPassword`).
- **Integration:** `<AuthProvider>` wraps the app in `main.jsx`, strictly placed alongside existing providers to prevent breaking current behavior.
- **Environment:** Defined `.env.example` as a template for environment variables. **Do not commit actual `.env` files.**

### UI Changes
- **Settings Modal:** Added a new "Account (Cloud Sync)" section to `SettingsModal.jsx`.
- **Auth Page:** Created `src/pages/AuthPage.jsx` providing email/password signup and login.
- **Reset Password Page:** Created `src/pages/ResetPasswordPage.jsx` which handles both sending the recovery email and providing the "Set New Password" form when a recovery session is active.
- **Routing:** Added `/auth` and `/reset-password` to `App.jsx`. Non-authenticated users can still access the entire application (Guest Mode).

### Dashboard Configuration Required
- **Site URL / Redirects:** In the Supabase dashboard (Authentication > URL Configuration), ensure the Site URL is set appropriately for your deployment (e.g., Netlify URL or `http://localhost:5173`).
- **Reset Password:** The reset password link requires configuring the redirect URL to point to `/reset-password` on the frontend.

### Tests Performed
1. App launches normally.
2. Existing localStorage GymLog works while logged out.
3. Added UI routes correctly render without errors.
4. `.gitignore` updated to prevent `.env.*` leaks.
5. No privileged keys or service roles are exposed to the client.
6. The `npm run build` process completes successfully.

### Known Limitations (Stage 1)
- Currently, Auth state only manages the user session. GymLog data (workouts, measurements) are not yet synced to Supabase.
- The cloud migration logic will be implemented in subsequent stages.

## Phase 13 — Supabase Migration: Stage 2 (Database Schema)

### Database Schema
- **Relational Tables:** Exploded the legacy `localStorage` JSON into 7 normalized PostgreSQL tables: `workout_days`, `exercises`, `active_sets`, `workout_history`, `workout_history_sets`, `measurements`, `measurement_entries`.
- **ID Strategy:** Used `TEXT` primary keys across all tables except `workout_history_sets` (which uses `UUID`) to ensure existing `localStorage` alphanumeric short-IDs can be migrated exactly as they are without maintaining complex mapping tables.
- **Ordering:** Removed arbitrary array ordering in favor of a strictly checked `position INTEGER` column on orderable entities (`workout_days`, `exercises`, `measurements`).

### RLS Architecture & Parent/Child Ownership Protection
- **Composite Foreign Keys:** Instead of relying on expensive `SELECT` subqueries in RLS policies to prevent User A from inserting an exercise into User B's workout day, we implemented strict multi-tenant integrity using **Composite Foreign Keys**. 
- Every parent table defines a `UNIQUE(id, user_id)` constraint. Every child table enforces `FOREIGN KEY (parent_id, user_id) REFERENCES parent(id, user_id) ON DELETE CASCADE`.
- This elegantly guarantees a child row can only be inserted if the parent exists *and* shares the exact same `user_id`.
- **Row Level Security:** Enabled RLS on all tables with a unified, high-performance policy: `USING (user_id = auth.uid())` which covers all CRUD operations natively and securely.

### Indexes & Migrations
- **Indexes:** Created performance indexes on all foreign keys to accelerate cascading deletes and JOINs, on `user_id` to accelerate RLS evaluation, and on temporal fields (`log_date`, `position`).
- **Migrations:** Output written to `supabase/migrations/20260924_initial_gymlog_schema.sql` for reproducible deployment via the Supabase SQL Editor or CLI.

### Tests Performed
- **Static Verification:** Verified SQL syntax, constraint relationships, and composite key logic.
- **Application Regression:** Verified `npm run build` completes successfully. The frontend application continues to function identically using `localStorage`, unaffected by the new schema definitions.

### Tests That Could Not Be Performed
- **Live Database Verification:** Because there is currently no active, configured Supabase backend environment (credentials missing from `.env`), the SQL migration could not be executed against a real database to empirically verify the RLS violations (e.g. testing User B inserting into User A's data).

### Supabase Dashboard Configuration Required
- The SQL file in `supabase/migrations/20260924_initial_gymlog_schema.sql` must be executed in the Supabase SQL Editor to provision the tables.

## Phase 13 — Supabase Migration: Stage 3 (Database Verification)

### Verification Summary
- **Static Schema Review:** The database schema and RLS policies created in Stage 2 were statically reviewed against the current GymLog `localStorage` constraints.
- **Ownership Validation:** It was verified that composite parent/child ownership is structurally enforced through the composite foreign keys (e.g., `FOREIGN KEY (parent_id, user_id) REFERENCES parent(id, user_id)`), preventing cross-user structural violations without relying on `SELECT` RLS subqueries.
- **RLS Validation:** The `FOR ALL USING (auth.uid() = user_id)` policies were statically reviewed. Because `WITH CHECK` natively defaults to the `USING` expression in PostgreSQL, updates attempting to transfer ownership to another user's ID are structurally blocked.
- **Migration Readiness:** The `TEXT` ID usage aligns with existing `uid()` string formats, meaning existing data can be migrated deterministically.

### Verification Exclusions (Pending Live Test)
Because the required Supabase environment variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`) are missing from the environment configuration (no `.env` file exists), no live Supabase operations were performed. The following tests are **pending** until a real Supabase project is configured:
- Live cross-user isolation tests
- Live anonymous access tests
- Live cascade and referential-integrity deletion tests

### Project Status
- No temporary data, test users, or credentials were created.
- The `DataContext` and existing application UI remain entirely unchanged.
- GymLog continues to function fully on `localStorage`.
