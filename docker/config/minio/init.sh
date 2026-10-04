#!/bin/sh
# Wait for MinIO to be ready
sleep 5

# Configure mc client
mc alias set local http://minio:9000 minioadmin minioadmin

# Create buckets
mc mb local/raw --ignore-existing
mc mb local/warehouse --ignore-existing

echo "MinIO buckets 'raw' and 'warehouse' created successfully"
