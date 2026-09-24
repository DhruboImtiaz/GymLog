import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useGymLogData } from './context/DataContext';
import Dashboard from './pages/Dashboard';
import WorkoutDay from './pages/WorkoutDay';
import ExerciseDetail from './pages/ExerciseDetail';
import { BottomNav } from './components/navigation/BottomNav';

import Measurements from './pages/Measurements';
import MeasurementDetail from './pages/MeasurementDetail';

import ExerciseProgress from './pages/ExerciseProgress';
import MeasurementProgress from './pages/MeasurementProgress';

import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

import { SettingsProvider } from './context/SettingsContext';
import SettingsModal from './components/settings/SettingsModal';
import { MigrationGuard } from './components/migration/MigrationGuard';

function App() {
  const { isMalformed, data } = useGymLogData();

  React.useEffect(() => {
    if (localStorage.getItem('gymlog_restore_success') === 'true') {
      localStorage.removeItem('gymlog_restore_success');
      alert('Data restored successfully');
    }
  }, []);

  if (isMalformed) {
    return (
      <div className="content empty">
        <h1 className="empty-title">Data Error</h1>
        <p className="empty-text">Your GymLog data is malformed and cannot be loaded. It has been preserved safely in storage.</p>
      </div>
    );
  }

  if (!data) {
    return null; // Don't flash loading screen to prevent jitter if loading is instant
  }

  return (
    <SettingsProvider>
      <MigrationGuard>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/day/:dayId" element={<WorkoutDay />} />
          <Route path="/day/:dayId/exercise/:exerciseId" element={<ExerciseDetail />} />
          <Route path="/day/:dayId/exercise/:exerciseId/progress" element={<ExerciseProgress />} />

          <Route path="/measurements" element={<Measurements />} />
          <Route path="/measurements/:measId" element={<MeasurementDetail />} />
          <Route path="/measurements/:measId/progress" element={<MeasurementProgress />} />

          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
        <BottomNav />
        <SettingsModal />
      </MigrationGuard>
    </SettingsProvider>
  );
}

export default App;
