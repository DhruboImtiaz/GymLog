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

## Stage 4 — Workout Set Logging & Exercise History

### 1. What was implemented
- **Exercise Detail Page:** Fully realized React `ExerciseDetail` page replacing the Stage 3 placeholder.
- **Set Logging (`AddSetForm`):** Implemented an immutable `addSet` mutation replicating vanilla data structures. Created a custom `NumberInput` replicating the quick-adjust `adj()` behavior.
- **Inline Editing (`SetRow`):** Developed a component-level state toggle to edit set reps and weight inline, persisting back to localStorage upon save.
- **Set Deletion:** Successfully reproduced the complex vanilla deletion logic that sequentially re-calculates the `num` property for all remaining sets below the deleted row.
- **Date Selection & Session Saving:** Ported the exact 0/1/2 offset date logic. Built `saveSession` which maps active sets, strips the volatile `id` field from historical records, sorts them chronologically, appends them to `history`, and empties the active sets list.
- **History Rendering:** Created `LastSessionCard` to parse the chronological `history` array and render previous workouts exactly like the vanilla DOM injection.

### 2. Architecture decisions
- **Split State Boundaries:** Deep persistence mutations strictly live in `DataContext` ensuring `gymlog_data` is always handled immutably. However, transient unsubmitted UI states (like the typing values of inline editing or the `NumberInput` intermediate decimals) live strictly in local component state. This prevents aggressive localStorage thrashing on every keystroke.
- **No Global History Context:** History parsing and date offsetting is managed locally within `ExerciseDetail`, keeping global context lightweight.

### 3. Data flow & Persistence
- Forms collect inputs locally -> Validate -> Call Context function (`addSet`, `saveSession`) -> Context executes deep immutable copy (`...ex.sets`) -> Context triggers `saveGymLogData` synchronously -> React automatically pushes new state down to re-render.
- `saveSession` specifically extracts `num, reps, weight` into independent objects to guarantee no references remain tied to the active array, protecting historical integrity when active sets are cleared.

### 4. Testing & Legacy Validation
- Loaded existing GymLog vanilla `localStorage` data; verified historical records rendered perfectly.
- Confirmed rapid additions auto-increment set numbers.
- Confirmed deleting Set 2 out of 3 dynamically shifts Set 3 to become Set 2.
- Verified Session Saving correctly clears active state and updates the Last Workout card.

### 5. Known limitations
- Progress charts and Measurement views remain pending for later stages.
- No Drag-and-drop implemented yet for reordering sets/exercises.

## Stage 5 — Measurements

### 1. What was implemented
- **Measurement Dashboard:** Created `Measurements.jsx` which perfectly replaces the `#pageMeasurements` view. It pulls the measurements array from context, renders cards, and manages local modal state for creating and renaming measurements.
- **Measurement Detail:** Created `MeasurementDetail.jsx` mapping to `/measurements/:measId`. It reuses the exact vanilla badge and layout styling to render entries in descending chronological order.
- **Entry Logging:** Implemented forms inside `MeasurementDetail` to capture numeric values and string units, calculating dates identically to the Exercises view.
- **Data Deletion:** Integrated exact vanilla deletion behaviors with `window.confirm` for both complete measurements and individual entries.

### 2. Architecture decisions
- **Context vs Component State:** Following the Stage 4 pattern, transient form state (modal text fields, new entry values) is kept locally within the page components. When "Save" or "Create" is clicked, it dispatches an immutable mutation to `DataContext` which synchronously writes to `localStorage`.
- **Date Management:** Re-used `DateSelector.jsx` from the exercises feature since the `0 / 1 / 2` offset logic perfectly applies to both domains.

### 3. Data flow & Persistence
- **Chronological Guarantee:** In vanilla, `measurements[].entries` were sorted strictly ascending by ISO date string on every insertion. The React `addMeasurementEntry` mutation perfectly replicates this by deep-copying the array and running `.sort((a,b) => a.date.localeCompare(b.date))` before saving, guaranteeing the underlying JSON schema is identical to vanilla.
- **Display Reversal:** To match vanilla UX, `MeasurementDetail` takes the chronologically ascending array from context and maps a `.reverse()` copy for the UI to place the newest entries at the top.

### 4. Testing & Legacy Validation
- Loaded existing GymLog vanilla `localStorage` data; verified measurement records and past entries rendered perfectly.
- Verified adding a new measurement.
- Verified renaming a measurement mutates only the specified `m.name`.
- Verified deletion of a measurement properly filters it out.
- Verified logging an entry for "Yesterday" properly inserted it in the middle of the JSON array chronologically, but rendered it appropriately in the UI.

### 5. Known limitations
- **Measurement Progress Charts:** Explicitly deferred to Stage 6 (Data Visualization) alongside Exercise Progress Charts to prevent fragmented architectural dependencies on `chart.js`.
- **Drag-and-Drop Reordering:** Explicitly deferred to a later Stage. The array retains its legacy ordering and rendering faithfully.

## Stage 6 — Data Visualization

### 1. What was implemented
- **Dependencies:** Installed `chart.js` and `react-chartjs-2` to provide an industry-standard, lifecycle-safe graphing framework natively built for React.
- **Shared Architecture:** Created `src/components/charts/LineChart.jsx`. It perfectly maps to vanilla's `opts` configuration object, including the hex string append `color + '22'` for the fill opacity, and handles dynamic chart `gc` (grid color) and `tc` (text color) depending on the active `ThemeContext`.
- **Exercise Progress (`ExerciseProgress.jsx`):** Reproduces all 3 charts (`#ff6b35` Max Weight, `#4ade80` Max Reps at Max Weight, `#60a5fa` Max Reps). Implements the month/year filter selectors identical to vanilla and safely executes mapping transformations directly on `exercise.history` arrays using `Math.max` fallback guarantees.
- **Measurement Progress (`MeasurementProgress.jsx`):** Filters and renders `measurement.entries` into a progression chart, identically maintaining the `value` mappings and `#4ade80` progression color.
- **Legacy Components Enabled:** Updated `ExerciseDetail.jsx` and `MeasurementDetail.jsx` to swap their disabled `Progress (Later)` buttons into active React Router navigation hooks that push into the respective progress views.

### 2. Architecture decisions
- **Lifecycle Management:** Replaced manual `wChart.destroy()` vanilla operations with declarative `<Line />` components. React and `react-chartjs-2` guarantee canvas reuse and automatic destroy/recreate lifecycles on unmount, completely preventing memory leaks.
- **Strictly Read-Only Data:** Neither progress view interacts with `DataContext.jsx` mutations. We create local `[...hist]` and `[...entries]` copies before chaining `.reverse()` to render the Workout History feed, ensuring we never accidentally mutate global chronological arrays.
- **Math Edge Cases:** Correctly maintained vanilla behaviors, e.g., if a session has no sets (`sets=[]`), vanilla evaluated `Math.max(...[{weight:0}])` to prevent `-Infinity`. This logic is duplicated precisely.

### 3. Testing & Legacy Validation
- Verified month/year drop downs correctly pre-select `now.getMonth()` and the most recent year containing data.
- Verified "No History Yet" empty state renders correctly when the month filter yields `0` records.
- Toggled dark/light mode and verified `<LineChart />` instantly updates the gridlines and text tick colors dynamically without a reload.
- Verified that `gymlog_data` remains completely unmutated when jumping back and forth across progress views.
- Verified legacy `index_vanilla.html` records plotted identically on the new React charts.

## Stage 7 — Drag-and-Drop Reordering

### 1. Vanilla behavior discovered
The vanilla architecture utilized a bespoke, highly-optimized drag-and-drop mechanism relying entirely on raw DOM Pointer Events (`pointerdown`, `pointermove`, `pointerup`). It specifically bound to `.card-drag-handle` to prevent scrolling collision on mobile, applied `.setPointerCapture` to maintain the dragging state even if the finger exited the screen, and directly applied 60FPS CSS transforms (`translate3d(0, deltaY, 0)`) to the dragged card and adjacent shifting cards to prevent the performance bottleneck of updating React state on every pixel move.

### 2. React Hook Architecture
- Extracted the exact vanilla algorithm into a custom React hook: `src/hooks/usePointerReorder.js`.
- It takes a `containerRef`, tracks the `itemsArray` dependency, and wires up the DOM logic directly. This avoids installing bloated drag libraries like `react-beautiful-dnd` or `dnd-kit`, perfectly maintaining the existing GymLog visual layout.
- Added strict cleanup (`removeEventListener`, `clearTimeout`, and restoring inline styles) on hook unmount to guarantee no stale class injections remain if the user navigates mid-drag.

### 3. DataContext Mutations
Created three targeted array replacements in `DataContext.jsx`:
- `reorderDays`
- `reorderExercises`
- `reorderMeasurements`
These mutations strictly replace the top-level array sequence using immutable spread operators. No mapping, filtering, ID generation, or nested payload manipulation occurs, guaranteeing `gymlog_data` schemas remain 100% legacy compatible and active sets/histories are untouched.

### 4. Integration
- `Dashboard.jsx`, `WorkoutDay.jsx`, and `Measurements.jsx` were upgraded with `const listRef = useRef(null)`.
- Reordering operations cleanly dispatch the `onSave` event resolving the new chronological array into React context immediately.

### 5. Testing & Validation
- Validated touch/pointer emulation dragging via handles.
- Confirmed that scrolling the screen by touching the body of the card functions exactly as expected (no scroll-lock bugs).
- Confirmed `pointercancel` securely releases the pointer capture and reverts transforms.
- Validated Stage 3-6 functionality remaining fully stable; clicking a card correctly routes, editing works, and charts still graph perfectly regardless of their day/exercise positioning.
