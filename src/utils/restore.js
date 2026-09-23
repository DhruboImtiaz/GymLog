import { CURRENT_SCHEMA_VERSION, runMigrations } from './migrations';

export function validateBackupFile(file, text) {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('Backup file is too large');
  }
  if (file.size === 0) {
    throw new Error('Invalid backup file. Empty.');
  }

  let backup;
  try {
    backup = JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid backup file.');
  }

  if (!backup.metadata || backup.metadata.app !== 'GymLog') {
    throw new Error('This backup was not created by GymLog.');
  }
  
  if (backup.metadata.schemaVersion === undefined) {
    throw new Error('Invalid backup file. Missing schema version.');
  }

  if (!backup.data || typeof backup.data !== 'object' || Object.keys(backup.data).length === 0) {
    throw new Error('Backup is corrupted.');
  }

  if (backup.metadata.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error('Backup uses an unsupported schema version.');
  }

  let parsedData = {};
  if (backup.data['gymlog_data']) {
    try {
      parsedData = JSON.parse(backup.data['gymlog_data']);
    } catch (e) {
      throw new Error('Backup is corrupted.');
    }
  }

  return { backup, parsedData };
}

export function executeRestore(backup) {
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
    throw new Error('Failed to restore backup.');
  }

  const rollback = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('gymlog_')) {
      rollback[key] = localStorage.getItem(key);
    }
  }

  try {
    // Wipe current gymlog keys
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gymlog_')) {
        localStorage.removeItem(key);
      }
    }

    // Insert new data
    for (const [key, value] of Object.entries(migratedDataModel)) {
      if (typeof value === 'object') {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, String(value));
      }
    }

    // Verify
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
    // Rollback
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
      throw new Error('Backup verification failed. Previous data has been restored.');
    } else {
      throw new Error('Failed to restore backup. Previous data has been restored.');
    }
  }
}
