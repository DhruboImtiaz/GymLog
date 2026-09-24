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
