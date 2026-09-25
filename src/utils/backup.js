import { CURRENT_SCHEMA_VERSION } from './migrations';
import { uid, downloadJSON } from './helpers';

export function generateBackup(currentData = null, sourceMode = 'guest') {
  // Collect GymLog data dynamically
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Identify GymLog keys by prefix 'gymlog_', explicitly avoiding restore_success
    if (key && key.startsWith('gymlog_') && key !== 'gymlog_restore_success') {
      data[key] = localStorage.getItem(key);
    }
  }

  if (sourceMode === 'cloud' && currentData) {
    data['gymlog_data'] = JSON.stringify(currentData);
  }

  const browser = navigator.userAgent;
  const platform = navigator.platform;

  const backup = {
    metadata: {
      app: 'GymLog',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      backupId: uid(),
      platform: platform,
      browser: browser
    },
    data: data
  };

  const dateStr = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const filename = `GymLog_Backup_${dateStr}.json`;

  downloadJSON(filename, backup);
  return filename; // returned for toast messages
}
