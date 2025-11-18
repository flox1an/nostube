#!/bin/bash
set -e

# Generate runtime environment configuration
# This script creates a JavaScript file that exposes environment variables
# to the frontend application at runtime (not build time)

echo "Generating runtime environment configuration..."

# Create the runtime-env.js file
cat > /usr/share/nginx/html/runtime-env.js <<EOF
// Runtime environment configuration
// Generated automatically by Docker entrypoint
// DO NOT EDIT - This file is regenerated on container start

window.__RUNTIME_ENV__ = {
  // Default relay URLs (comma-separated list)
  RELAYS: "${RUNTIME_RELAYS:-wss://relay.divine.video,wss://relay.damus.io,wss://nos.lol}",

  // Default Blossom servers (comma-separated list)
  BLOSSOM_SERVERS: "${RUNTIME_BLOSSOM_SERVERS:-https://almond.slidestr.net}",

  // Application title
  APP_TITLE: "${RUNTIME_APP_TITLE:-Nostube}",

  // Debug mode
  DEBUG: "${RUNTIME_DEBUG:-false}",

  // Custom configuration (JSON string)
  CUSTOM_CONFIG: ${RUNTIME_CUSTOM_CONFIG:-null},

  // Build timestamp
  BUILD_TIME: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
};

// Helper function to parse comma-separated values
window.__RUNTIME_ENV__.parseCSV = function(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
};

console.log('Runtime environment loaded:', window.__RUNTIME_ENV__);
EOF

echo "Runtime environment configuration generated successfully"

# List all RUNTIME_* environment variables for debugging
echo "Active runtime configuration:"
env | grep "^RUNTIME_" || echo "  (no RUNTIME_* variables set, using defaults)"
