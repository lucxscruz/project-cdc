#!/bin/sh
# Wait for MinIO to be ready
sleep 5

# Configure mc client
mc alias set local http://minio:9000 minioadmin minioadmin

# Create the raw bucket
mc mb local/raw --ignore-existing

echo "MinIO bucket 'raw' created successfully"
