// Runtime environment configuration
// This file is used during local development
// In Docker, this file is replaced by the entrypoint script with actual runtime values

window.__RUNTIME_ENV__ = {
  // Default values for local development
  // These will be overridden in Docker deployment
  RELAYS: '',
  BLOSSOM_SERVERS: '',
  APP_TITLE: '',
  DEBUG: '',
  CUSTOM_CONFIG: null,
  BUILD_TIME: new Date().toISOString(),
}

// Helper function to parse comma-separated values
window.__RUNTIME_ENV__.parseCSV = function (value) {
  if (!value) return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

console.log('Runtime environment loaded (development mode)')
