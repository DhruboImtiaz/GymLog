// js/migrations.js

const CURRENT_SCHEMA_VERSION = 1;

const migrations = {
  // Add migration functions here as schema evolves
  // Example for future:
  // 1: function migrateV1toV2(data) { return data; },
};

function runMigrations(parsedDataModel, backupSchemaVersion) {
  let currentVersion = backupSchemaVersion;
  
  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    if (migrations[currentVersion]) {
      parsedDataModel = migrations[currentVersion](parsedDataModel);
      currentVersion++;
      
      // Validation check after each migration
      if (!parsedDataModel || typeof parsedDataModel !== 'object') {
        throw new Error(`Migration ${currentVersion - 1} to ${currentVersion} resulted in invalid data.`);
      }
    } else {
      throw new Error(`Missing migration for version ${currentVersion}`);
    }
  }
  
  return parsedDataModel;
}
