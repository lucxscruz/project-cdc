#!/bin/bash
set -e

cd "$(dirname "$0")/docker"

echo "Starting CDC Platform..."

echo "[1/4] Starting infrastructure..."
docker compose -f compose.infra.yml up -d

echo "[2/4] Starting observability..."
docker compose -f compose.observability.yml up -d

echo "[3/4] Starting application..."
docker compose -f compose.app.yml up -d

echo "[4/4] Registering CDC connectors..."
until curl -sf http://localhost:8083/connectors > /dev/null 2>&1; do sleep 3; done
bash ../docker/connectors/register-all.sh

echo ""
echo "CDC Platform ready!"
echo ""
echo "  Web Panel:         http://localhost:5173"
echo "  Redpanda Console:  http://localhost:8080"
echo "  Grafana:           http://localhost:3000  (admin/admin)"
echo "  MinIO Console:     http://localhost:19001  (minioadmin/minioadmin)"
echo "  BFF API:           http://localhost:3001/api"
