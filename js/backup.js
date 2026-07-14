// js/backup.js

function generateBackup() {
  toast('Preparing backup...', 'success');
  
  // Collect GymLog data dynamically
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Identify GymLog keys by prefix 'gymlog_'
    if (key && key.startsWith('gymlog_')) {
      data[key] = localStorage.getItem(key);
    }
  }

  const browser = navigator.userAgent;
  const platform = navigator.platform;

  const backup = {
    metadata: {
      app: 'GymLog',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      backupId: uid(), // Existing uid() from index.html
      platform: platform,
      browser: browser
    },
    data: data
  };

  const dateStr = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const filename = `GymLog_Backup_${dateStr}.json`;

  toast('Backup created successfully.', 'success');
  downloadJSON(filename, backup);
}
