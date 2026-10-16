import React from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { useGymLogData } from './context/DataContext';
import Dashboard from './pages/Dashboard';
import WorkoutDay from './pages/WorkoutDay';
import ExerciseDetail from './pages/ExerciseDetail';
import { BottomNav } from './components/navigation/BottomNav';
import { TopBar } from './components/navigation/TopBar';

import Measurements from './pages/Measurements';
import MeasurementDetail from './pages/MeasurementDetail';

import ExerciseProgress from './pages/ExerciseProgress';
import MeasurementProgress from './pages/MeasurementProgress';

import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

import { SettingsProvider } from './context/SettingsContext';
import SettingsModal from './components/settings/SettingsModal';
import { MigrationGuard } from './components/migration/MigrationGuard';

function AppShell() {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-content-wrapper">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}

function App() {
  const { isMalformed, data, cloudStatus, cloudError, clearCloudError, retryCloud, retryPendingWrite, pendingWrite, cloudBusy, refreshing, sourceMode } = useGymLogData();

  const [restoreSuccess, setRestoreSuccess] = React.useState(false);

  React.useEffect(() => {
    try {
      if (localStorage.getItem('gymlog_restore_success') === 'true') {
        localStorage.removeItem('gymlog_restore_success');
        setRestoreSuccess(true);
      }
    } catch { /* Storage failures are reported by the data provider. */ }
  }, []);

  if (isMalformed) {
    return (
      <div className="content empty">
        <h1 className="empty-title">Data Error</h1>
        <p className="empty-text">Your GymLog data is malformed and cannot be loaded. It has been preserved safely in storage.</p>
        <button className="btn btn-primary" onClick={retryCloud}>Retry loading data</button>
      </div>
    );
  }

  if (cloudStatus === 'error' && !data) {
    return (
      <div className="content empty">
        <h1 className="empty-title">{sourceMode === 'guest' ? 'Storage Error' : 'Cloud Error'}</h1>
        <p className="empty-text">{cloudError || 'Failed to connect to the cloud database.'}</p>
        <button className="btn btn-primary" disabled={refreshing} onClick={retryCloud}>{refreshing ? 'Retrying…' : 'Retry connection'}</button>
      </div>
    );
  }

  if (!data && sourceMode !== 'migration') {
    return null; // Don't flash loading screen to prevent jitter if loading is instant
  }

  return (
    <SettingsProvider>
      <MigrationGuard>
        {restoreSuccess && (
          <div style={{ background: 'var(--success, #28a745)', color: '#fff', padding: '10px', textAlign: 'center', fontWeight: 'bold', zIndex: 1000, position: 'relative' }}>
            Data restored successfully
            <button onClick={() => setRestoreSuccess(false)} style={{ marginLeft: '10px', background: 'transparent', border: '1px solid #fff', color: '#fff', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>Dismiss</button>
          </div>
        )}
        {sourceMode === 'cloud' && <div role="status" style={{ padding: '8px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span>{cloudBusy ? 'Saving…' : refreshing ? 'Refreshing…' : cloudStatus === 'stale' ? 'Showing last loaded data' : 'Cloud data loaded'}</span>
          <button className="btn btn-xs" disabled={cloudBusy || refreshing} onClick={retryCloud}>Refresh</button>
        </div>}
        {pendingWrite && <div role="alert" style={{ padding: '12px 16px', background: 'var(--adim)' }}>
          {pendingWrite.phase === 'acknowledged' ? 'Your change was saved. Finish refreshing before making another change.' : 'A previous change may not have finished. Retry it safely before making another change.'}
          <button className="btn btn-sm" disabled={cloudBusy || refreshing} onClick={retryPendingWrite}>Retry saved change</button>
        </div>}
        {cloudError && (
          <div style={{ background: 'var(--danger, #ff4444)', color: '#fff', padding: '10px', textAlign: 'center', fontWeight: 'bold', zIndex: 1000, position: 'relative' }}>
            {cloudError}
            <button disabled={cloudBusy || refreshing} onClick={retryCloud} style={{ marginLeft: '10px' }}>Retry refresh</button>
            <button onClick={clearCloudError} style={{ marginLeft: '10px', background: 'transparent', border: '1px solid #fff', color: '#fff', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>Dismiss</button>
          </div>
        )}
        <Routes>
          <Route element={<AppShell />}>
            {sourceMode === 'migration' ? (
              <Route path="*" element={
                <div className="content empty">
                  <h1 className="empty-title">ACCOUNT SYNC REQUIRED</h1>
                  <p className="empty-text">Please resolve your pending data migration to access your GymLog.</p>
                </div>
              } />
            ) : (
              <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/day/:dayId" element={<WorkoutDay />} />
                <Route path="/day/:dayId/exercise/:exerciseId" element={<ExerciseDetail />} />
                <Route path="/day/:dayId/exercise/:exerciseId/progress" element={<ExerciseProgress />} />

                <Route path="/measurements" element={<Measurements />} />
                <Route path="/measurements/:measId" element={<MeasurementDetail />} />
                <Route path="/measurements/:measId/progress" element={<MeasurementProgress />} />
              </>
            )}
          </Route>

          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
        <SettingsModal />
      </MigrationGuard>
    </SettingsProvider>
  );
}

export default App;
