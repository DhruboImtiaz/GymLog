import { CURRENT_SCHEMA_VERSION, runMigrations } from './migrations.js';

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

export function deepValidateBackup(data) {

  if (!data || typeof data !== 'object') throw new Error('Data payload must be an object.'); if (!Array.isArray(data.days)) throw new Error('Missing or invalid days array.');
  if (!Array.isArray(data.measurements)) throw new Error('Missing or invalid measurements array.');

  const seenIds = new Set();

  function checkId(id) {
    if (typeof id !== 'string' || id.trim() === '') throw new Error('Invalid ID encountered.');
    if (seenIds.has(id)) throw new Error(`Duplicate ID encountered: ${id}`);
    seenIds.add(id);
  }

  function checkDate(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(d)) {
      throw new Error(`Invalid date string: ${d}`);
    }
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const dateObj = new Date(year, month, day);
    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month || dateObj.getDate() !== day) {
      throw new Error(`Invalid date string: ${d}`);
    }
  }

  function checkString(s) {
    if (typeof s !== 'string' || s.trim() === '') throw new Error('Missing or empty required string.');
  }

  function checkNumber(n, allowZero = false, allowNegative = false, isInteger = false) {
    if (typeof n !== 'number' || !isFinite(n) || isNaN(n)) throw new Error(`Invalid number: ${n}`);
    if (isInteger && !Number.isInteger(n)) throw new Error(`Number must be an integer: ${n}`);
    if (!allowNegative && n < 0) throw new Error(`Negative number not allowed: ${n}`);
    if (!allowZero && n === 0) throw new Error(`Zero not allowed for this field: ${n}`);
  }

  // Days
  data.days.forEach(day => {
    checkId(day.id);
    checkString(day.name);
    if (day.createdAt !== undefined) checkDate(day.createdAt);
    if (!Array.isArray(day.exercises)) throw new Error(`Missing exercises for day ${day.id}`);

    // Exercises
    day.exercises.forEach(ex => {
      checkId(ex.id);
      checkString(ex.name);

      // Active Sets
      if (ex.sets) {
        if (!Array.isArray(ex.sets)) throw new Error(`Invalid sets for exercise ${ex.id}`);
        ex.sets.forEach(set => {
          checkId(set.id);
          checkNumber(set.num, false, false, true);
          checkNumber(set.reps, false, false, true);
          checkNumber(set.weight, true, false, false); // weight can be zero
        });
      }

      // History
      if (ex.history) {
        if (!Array.isArray(ex.history)) throw new Error(`Invalid history for exercise ${ex.id}`);
        ex.history.forEach(hist => {
          checkId(hist.id);
          checkDate(hist.date);

          if (hist.sets) {
            if (!Array.isArray(hist.sets)) throw new Error(`Invalid history sets for history ${hist.id}`);
            hist.sets.forEach(hSet => {
              checkNumber(hSet.num, false, false, true);
              checkNumber(hSet.reps, false, false, true);
              checkNumber(hSet.weight, true, false, false);
            });
          }
        });
      }
    });
  });

  // Measurements
  data.measurements.forEach(meas => {
    checkId(meas.id);
    checkString(meas.name);
    if (meas.createdAt !== undefined) checkDate(meas.createdAt);

    if (meas.entries) {
      if (!Array.isArray(meas.entries)) throw new Error(`Invalid entries for measurement ${meas.id}`);
      meas.entries.forEach(entry => {
        checkId(entry.id);
        checkDate(entry.date);
        checkNumber(entry.value, true, true); // Values can be zero or negative
        checkString(entry.unit);
      });
    }
  });
}
