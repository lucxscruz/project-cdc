#!/bin/bash
cd "$(dirname "$0")/docker"

echo "Stopping CDC Platform..."
docker compose -f compose.app.yml down
docker compose -f compose.observability.yml down
docker compose -f compose.infra.yml down

echo "CDC Platform stopped."
