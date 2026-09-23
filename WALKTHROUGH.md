# GymLog React Migration Walkthrough

## Stage 2 — React + Vite Foundation
- Established Vite + React foundation (`index.html`, `main.jsx`, `App.jsx`).
- Created `storage.js` to strictly preserve existing `localStorage` keys and data structures without schema modifications.
- Implemented `DataContext`, `ThemeContext`, and `FontContext` to provide application state immutably.
- Extracted and preserved the original `index.css`.
- Renamed the original monolith file to `index_vanilla.html` for safe preservation and regression testing.

## Stage 3 — Core Data, Navigation & Application Shell

### 1. What was implemented
- **Navigation:** Integrated `react-router-dom` to replace the manual `history.pushState` logic. Recreated the SPA page transitions across the Dashboard, Workout Day, and Exercise Detail placeholders. Recreated the Bottom Navigation.
- **Core CRUD:** Implemented safe, immutable React state updates for creating, renaming, and deleting Workout Days and Exercises.
- **Modals:** Recreated the Create, Rename, and Delete Confirmation modals using React component state overlaid on the existing CSS classes.
- **UI Shell:** Constructed the `Dashboard`, `WorkoutDay`, and `ExerciseDetail` page components to exactly match the vanilla aesthetics and interactions.

### 2. Why it was implemented
This sets up the functional skeleton of the application, connecting the foundational data context to the user interface. By migrating the core navigation and entity creation first, we establish the path for complex set-logging and data mutation in the next stages.

### 3. Architecture decisions
- **React Router:** Used `react-router-dom` for navigation instead of custom history management. It natively handles browser back/forward buttons effortlessly, solving edge cases manually coded in the old app.
- **Local Modal State:** Modals (like Create Day or Edit Exercise) are managed via local component state (`useState`) rather than global context because they are strictly tied to the view currently rendered.

### 4. React component structure
- `App.jsx`: Declares all `<Route>` mappings.
- `pages/Dashboard.jsx`: Lists all `data.days`. Houses modals for Day CRUD.
- `pages/WorkoutDay.jsx`: Reads `dayId` from URL. Lists all `day.exercises`. Houses modals for Exercise CRUD.
- `pages/ExerciseDetail.jsx`: Placeholder for future set logging.
- `components/ui/Icons.jsx`: Encapsulates all SVG icons previously inline in the HTML.
- `components/navigation/BottomNav.jsx`: Uses `NavLink` to handle active states automatically.

### 5. Data flow
- Interactions flow down: A user clicks "New Day" -> Modal opens -> Input submitted -> Context `createDay(name)` is called.
- Context runs immutable map/filter logic -> calls `saveGymLogData` -> updates Context state -> UI re-renders automatically.

### 6. How Context/state works
- `DataContext` holds the entire `gymlog_data` tree. It exposes functions like `addExercise` which utilize the spread operator to deeply copy the nested state, avoiding reference mutation bugs.

### 7. How localStorage persistence works
- Every single CRUD operation within `DataContext` immediately invokes `saveAndSetData(newData)`, guaranteeing that the React state and `localStorage` are always perfectly synchronized.

### 8. How workout day CRUD works
- **Create:** Pushes a new object `{ id: uid(), name, createdAt: today(), exercises: [] }` to the `days` array.
- **Rename:** Maps over `days` and updates the `name` field if the `id` matches.
- **Delete:** Filters the `days` array to remove the matching `id`.

### 9. How exercise CRUD works
- Operates similarly to Day CRUD, but maps over `days` to find the matching `dayId`, then mutates the `exercises` array inside that specific day, preserving all other days perfectly. The nested sets/history are meticulously preserved via spread operator (`...ex`).

### 10. How navigation works
- Uses React Router's `<BrowserRouter>`, `<Routes>`, and `<Route>`. `useNavigate()` is used for programmatic navigation (e.g., clicking on a day card).

### 11. How browser back/forward works
- Handled natively by React Router listening to the History API `popstate`.

### 12. How modals work
- Conditional rendering: `{isAddOpen && ( <div className="modal-overlay open">...</div> )}`
- State variables like `confirmDeleteId` store the target ID and trigger the rendering of the Delete Confirmation overlay.

### 13. Important functions and their responsibilities
- `uid()`: Generates unique collision-resistant IDs matching the vanilla app.
- `esc()`: Protects against XSS rendering, ported from vanilla.
- `saveAndSetData()`: The critical chokepoint ensuring no malformed data is ever written to storage.

### 14. Files created
- `src/components/ui/Icons.jsx`
- `src/components/navigation/BottomNav.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/WorkoutDay.jsx`
- `src/pages/ExerciseDetail.jsx`
- `src/utils/helpers.js`
- `WALKTHROUGH.md`

### 15. Files modified
- `src/context/DataContext.jsx`
- `src/App.jsx`
- `src/main.jsx`

### 16. Files preserved
- `index_vanilla.html` and legacy JS files.

### 17. Testing performed
- Booted Vite dev server.
- Created Day, Renamed Day, Deleted Day.
- Added Exercise, Renamed Exercise, Deleted Exercise.
- Navigated Day -> Exercise -> Back -> Dashboard.
- Checked localStorage to ensure sets and history structures were not wiped by edits.
- Tested `npm run build`.

### 18. Known limitations
- Exercise Details is currently a static placeholder displaying counts.
- Measurements are a static placeholder.
- Drag-and-Drop is disabled visually but not yet wired to update state.

### 19. What remains for future stages
- Active set logging.
- Session history saving.
- Progress chart migrations.
- Drag-and-drop state wiring.
- Backup/restore logic bridging.
