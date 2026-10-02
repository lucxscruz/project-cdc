#!/bin/bash
set -e

echo "Initializing Superset..."

# Create admin user
superset fab create-admin \
  --username admin \
  --firstname Admin \
  --lastname CDC \
  --email admin@cdc.local \
  --password admin 2>/dev/null || true

# Migrate DB
superset db upgrade

# Initialize roles
superset init

# Add Trino connection if not exists
superset set-database-uri \
  --database-name "Trino (CDC)" \
  --uri "trino://trino@trino:8085" 2>/dev/null || true

echo "Superset ready!"

# Start server
/usr/bin/run-server.sh
