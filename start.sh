#!/bin/bash
set -e

cd "$(dirname "$0")/docker"

echo "Starting CDC Platform..."
docker compose up -d

echo "Waiting for Kafka Connect..."
until curl -sf http://localhost:8083/connectors > /dev/null 2>&1; do sleep 3; done

echo "Registering CDC connectors..."
bash ../docker/connectors/register-all.sh

echo ""
echo "CDC Platform ready!"
echo ""
echo "  Web Panel:         http://localhost:5173"
echo "  Redpanda Console:  http://localhost:8080"
echo "  Grafana:           http://localhost:3000  (admin/admin)"
echo "  MinIO Console:     http://localhost:19001  (minioadmin/minioadmin)"
echo "  BFF API:           http://localhost:3001/api"
