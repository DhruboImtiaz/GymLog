import { CURRENT_SCHEMA_VERSION } from './migrations';
import { uid, downloadJSON } from './helpers';

export function generateBackup(currentData = null, sourceMode = 'guest') {
  // Collect GymLog data dynamically
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Recovery journals and migration acknowledgements belong to this browser/account.
    if (['gymlog_data', 'gymlog_theme', 'gymlog_font_size'].includes(key)) {
      data[key] = localStorage.getItem(key);
    }
  }

  if (currentData) {
    data['gymlog_data'] = JSON.stringify(currentData);
  }

  if (!data['gymlog_data']) data['gymlog_data'] = JSON.stringify({ days: [], measurements: [] });

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
