#!/bin/sh
# ==============================================================================
# Docker Entrypoint Script
# Handles database migrations before starting the application
# ==============================================================================

set -e

echo "=== Shopee Affiliate Bot - Starting ==="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1')
  .then(() => { pool.end(); process.exit(0); })
  .catch(() => { pool.end(); process.exit(1); });
" 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping 2s"
  sleep 2
done
echo "PostgreSQL is ready!"

# Run database migrations
echo "Running database migrations..."
npm run migrate
echo "Migrations complete!"

# Start the application
echo "Starting application..."
exec node index-webhook.js

