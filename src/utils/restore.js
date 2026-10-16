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
    if (!['gymlog_data', 'gymlog_theme', 'gymlog_font_size'].includes(key)) continue;
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

  deepValidateBackup(migratedDataModel['gymlog_data']);

  // One localStorage value contains the complete workout dataset. setItem is
  // atomic: a quota/security failure leaves the previous value intact.
  try {
    localStorage.setItem('gymlog_data', JSON.stringify(migratedDataModel['gymlog_data']));
  } catch {
    throw new Error('Failed to restore workout data. Your existing data is unchanged.');
  }
  try {
    for (const key of ['gymlog_theme', 'gymlog_font_size']) {
      if (migratedDataModel[key] !== undefined) localStorage.setItem(key, String(migratedDataModel[key]));
    }
    localStorage.setItem('gymlog_restore_success', 'true');
  } catch {
    throw new Error('Workout data was restored, but browser storage could not finish saving settings. Reload to view the restored data.');
  }
  window.location.reload();
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
    checkDate(day.createdAt);
    if (!Array.isArray(day.exercises)) throw new Error(`Missing exercises for day ${day.id}`);

    // Exercises
    day.exercises.forEach(ex => {
      checkId(ex.id);
      checkString(ex.name);

      // Active Sets
      if (ex.sets !== undefined) {
        if (!Array.isArray(ex.sets)) throw new Error(`Invalid sets for exercise ${ex.id}`);
        const setNumbers = new Set();
        ex.sets.forEach(set => {
          if (setNumbers.has(set.num)) throw new Error('Duplicate active set number.');
          setNumbers.add(set.num);
          checkId(set.id);
          checkNumber(set.num, false, false, true);
          checkNumber(set.reps, false, false, true);
          checkNumber(set.weight, true, false, false); // weight can be zero
        });
      }

      // History
      if (ex.history !== undefined) {
        if (!Array.isArray(ex.history)) throw new Error(`Invalid history for exercise ${ex.id}`);
        ex.history.forEach(hist => {
          checkId(hist.id);
          checkDate(hist.date);

          if (hist.sets !== undefined) {
            if (!Array.isArray(hist.sets)) throw new Error(`Invalid history sets for history ${hist.id}`);
            const historyNumbers = new Set();
            hist.sets.forEach(hSet => {
              if (historyNumbers.has(hSet.num)) throw new Error('Duplicate historical set number.');
              historyNumbers.add(hSet.num);
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
    checkDate(meas.createdAt);

    if (meas.entries !== undefined) {
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
