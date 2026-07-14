// js/restore.js

let pendingRestoreBackup = null;

async function startRestore() {
  try {
    const file = await triggerFilePicker('.json');
    if (!file) return; // Cancelled
    
    if (file.size > 100 * 1024 * 1024) {
      toast('Backup file is too large', 'error');
      return;
    }
    if (file.size === 0) {
      toast('Invalid backup file. Empty.', 'error');
      return;
    }

    toast('Reading backup...', 'success');
    const text = await readFileAsText(file);
    
    let backup;
    try {
      backup = JSON.parse(text);
    } catch (e) {
      toast('Invalid backup file.', 'error');
      return;
    }

    if (!backup.metadata || backup.metadata.app !== 'GymLog') {
      toast('This backup was not created by GymLog.', 'error');
      return;
    }
    
    if (backup.metadata.schemaVersion === undefined) {
      toast('Invalid backup file. Missing schema version.', 'error');
      return;
    }

    if (!backup.data || typeof backup.data !== 'object' || Object.keys(backup.data).length === 0) {
      toast('Backup is corrupted.', 'error');
      return;
    }

    if (backup.metadata.schemaVersion > CURRENT_SCHEMA_VERSION) {
      toast('Backup uses an unsupported schema version.', 'error');
      return;
    }

    let parsedData = {};
    if (backup.data['gymlog_data']) {
      try {
        parsedData = JSON.parse(backup.data['gymlog_data']);
      } catch (e) {
        toast('Backup is corrupted.', 'error');
        return;
      }
    }

    let dtStr = 'Unknown';
    if (backup.metadata.createdAt) {
      const d = new Date(backup.metadata.createdAt);
      if (!isNaN(d.getTime())) {
        dtStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
    }

    const daysCount = (parsedData.days || []).length;
    let exCount = 0;
    let histCount = 0;
    (parsedData.days || []).forEach(day => {
      exCount += (day.exercises || []).length;
      (day.exercises || []).forEach(ex => {
        histCount += (ex.history || []).length;
      });
    });

    let measCount = 0;
    (parsedData.measurements || []).forEach(m => {
      measCount += (m.entries || []).length;
    });

    const theme = backup.data['gymlog_theme'] || 'Unknown';
    const appVer = backup.metadata.appVersion || 'Unknown';
    const schemaVer = backup.metadata.schemaVersion !== undefined ? backup.metadata.schemaVersion : 'Unknown';

    document.getElementById('prevCreated').innerText = dtStr;
    document.getElementById('prevAppVer').innerText = appVer;
    document.getElementById('prevSchemaVer').innerText = schemaVer;
    document.getElementById('prevDays').innerText = daysCount;
    document.getElementById('prevEx').innerText = exCount;
    document.getElementById('prevHist').innerText = histCount + ' Sessions';
    document.getElementById('prevMeas').innerText = measCount + ' Entries';
    document.getElementById('prevTheme').innerText = theme.charAt(0).toUpperCase() + theme.slice(1);

    pendingRestoreBackup = backup;
    closeModal('modalSettings'); 
    openModal('modalBackupPreview');

  } catch (e) {
    console.error(e);
    toast('Invalid backup file.', 'error');
  }
}

async function confirmBackupPreview() {
  closeModal('modalBackupPreview');
  if (!pendingRestoreBackup) return;
  await executeRestore(pendingRestoreBackup);
  pendingRestoreBackup = null;
}

async function executeRestore(backup) {
  toast('Migrating data...', 'success');
  
  let parsedDataModel = {};
  for (const [key, value] of Object.entries(backup.data)) {
    try {
      parsedDataModel[key] = JSON.parse(value);
    } catch(e) {
      parsedDataModel[key] = value;
    }
  }

  let migratedDataModel;
  try {
    migratedDataModel = runMigrations(parsedDataModel, backup.metadata.schemaVersion);
  } catch (e) {
    console.error(e);
    toast('Failed to restore backup.', 'error');
    return;
  }

  const rollback = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('gymlog_')) {
      rollback[key] = localStorage.getItem(key);
    }
  }

  toast('Restoring...', 'success');

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gymlog_')) {
        localStorage.removeItem(key);
      }
    }

    for (const [key, value] of Object.entries(migratedDataModel)) {
      if (typeof value === 'object') {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, String(value));
      }
    }

    let verified = false;
    try {
      const dbStr = localStorage.getItem('gymlog_data');
      if (!dbStr) {
        verified = true;
      } else {
        const db = JSON.parse(dbStr);
        if (Array.isArray(db.days) && Array.isArray(db.measurements)) {
          verified = true;
        }
      }
    } catch(e) {}

    if (!verified) {
      throw new Error('Backup verification failed.');
    }

    localStorage.setItem('gymlog_restore_success', 'true');
    window.location.reload();

  } catch (e) {
    console.error(e);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gymlog_')) {
        localStorage.removeItem(key);
      }
    }
    for (const [key, value] of Object.entries(rollback)) {
      localStorage.setItem(key, value);
    }
    
    if (e.message === 'Backup verification failed.') {
      toast('Backup verification failed. Previous data has been restored.', 'error');
    } else {
      toast('Failed to restore backup. Previous data has been restored.', 'error');
    }
  }
}
