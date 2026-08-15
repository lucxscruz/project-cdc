#!/bin/bash
set -e

CONNECT_URL="http://localhost:8083"

echo "Waiting for Kafka Connect to be ready..."
until curl -sf "$CONNECT_URL/connectors" > /dev/null 2>&1; do
  sleep 2
done
echo "Kafka Connect is ready."

for file in docker/connectors/register-*.json; do
  name=$(jq -r '.name' "$file")
  echo "Registering connector: $name"
  curl -sf -X POST "$CONNECT_URL/connectors" \
    -H "Content-Type: application/json" \
    -d @"$file"
  echo ""
done

echo "All connectors registered."
echo ""
curl -s "$CONNECT_URL/connectors?expand=status" | jq '.[] | {name: .status.name, state: .status.connector.state}'
