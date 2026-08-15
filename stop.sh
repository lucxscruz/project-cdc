#!/bin/bash
cd "$(dirname "$0")/docker"

echo "Stopping CDC Platform..."
docker compose down
echo "CDC Platform stopped."
