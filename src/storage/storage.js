const DATA_KEY = 'gymlog_data';
const THEME_KEY = 'gymlog_theme';
const FONT_SIZE_KEY = 'gymlog_font_size';

// Safe wrapper around localStorage parsing
function safeParse(jsonString, fallback) {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('GymLog Storage Error: Failed to parse JSON', e);
    return null; // Return null on error to indicate malformed data
  }
}

export function getGymLogData() {
  const rawData = localStorage.getItem(DATA_KEY);
  if (!rawData) {
    // No data exists yet, return default schema
    return { days: [], measurements: [] };
  }
  
  const parsedData = safeParse(rawData, null);
  if (!parsedData) {
    // Malformed data detected. Return null so the app knows it shouldn't overwrite it.
    return null;
  }
  
  // Ensure the schema shape exists
  if (!parsedData.days) parsedData.days = [];
  if (!parsedData.measurements) parsedData.measurements = [];
  
  return parsedData;
}

export function saveGymLogData(data) {
  // Never save null or undefined
  if (data) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

export function getFontSize() {
  const saved = localStorage.getItem(FONT_SIZE_KEY);
  return saved ? parseInt(saved, 10) : 16;
}

export function saveFontSize(size) {
  localStorage.setItem(FONT_SIZE_KEY, size);
}
