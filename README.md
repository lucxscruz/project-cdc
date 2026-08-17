# CDC Platform

Change Data Capture platform for learning — captures database changes from PostgreSQL and MySQL via Debezium, streams through Redpanda (with Schema Registry), and sinks to MinIO. Includes a management panel and observability stack.

## Architecture

```
PostgreSQL/MySQL → Debezium → Redpanda (Avro + Schema Registry) → S3 Sink → MinIO (JSON, raw/)

React → Node BFF → Kafka Connect API / Database APIs / MinIO / Prometheus
Prometheus + Grafana + Loki + Promtail → Observability
```

Messages inside Kafka travel as **Avro** (serialized via `io.confluent.connect.avro.AvroConverter`). Schemas are auto-registered in Redpanda's built-in Schema Registry at `http://redpanda:8081`. The S3 Sink Connector outputs **JSON** to MinIO.

## Stack

| Component | Technology |
|-----------|-----------|
| Databases | PostgreSQL 16, MySQL 8 |
| CDC | Debezium 2.5 |
| Streaming | Redpanda (Kafka-compatible broker + built-in Schema Registry) |
| Serialization | Avro via `io.confluent.connect.avro.AvroConverter` |
| Storage | MinIO (JSON, partitioned by table/date) |
| Backend | Node.js + Fastify (BFF) |
| Frontend | React + Vite + Shadcn/ui |
| Monitoring | Prometheus + Grafana + Loki + Promtail |

## Quick Start

```bash
# 1. Start all infrastructure (unified compose)
./start.sh

# 2. Register CDC connectors
./connectors/register-all.sh

# 3. Stop everything
./stop.sh
```

## URLs

| Service | URL |
|---------|-----|
| Web Panel | http://localhost:5173 |
| BFF API | http://localhost:3001/api |
| Grafana | http://localhost:3000 (admin/admin) |
| Kafka Connect | http://localhost:8083 |
| Redpanda Console | http://localhost:8080 (topics, messages, schemas) |
| Schema Registry | http://localhost:8081 |
| MinIO Console | http://localhost:19001 (minioadmin/minioadmin) |
| MinIO API | http://localhost:19000 |
| Prometheus | http://localhost:9090 |

## Port Notes

Some host ports differ from container ports to avoid local conflicts:

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| MySQL | 3307 | 3306 |
| Schema Registry | 8081 | 8081 (internal: redpanda:8081) |
| MinIO API | 19000 | 9000 |
| MinIO Console | 19001 | 9001 |

## Schema Registry

Redpanda ships with a built-in Schema Registry — no separate container needed. Kafka Connect uses `io.confluent.connect.avro.AvroConverter` for both key and value converters, pointing to `http://redpanda:8081`. Schemas are auto-registered on first message and are visible in Redpanda Console under the **Schemas** tab.

Compatibility mode is set to **BACKWARD** at the registry level.

## Kafka Connect Image

The `kafka-connect` service uses a custom Dockerfile (`docker/kafka-connect/Dockerfile`) that extends `debezium/connect:2.5` and adds:

- S3 Sink Connector plugin (pre-downloaded JARs in `s3-plugin/`)
- `kafka-connect-avro-converter` JAR (downloaded from Maven)
- Guava and `failureaccess` JARs (required dependencies)
- All converter JARs copied to `/kafka/libs/` for classpath visibility

A `CLASSPATH` environment variable is set in the service to ensure the AvroConverter is discoverable by the Kafka Connect worker.

## Development

```bash
# BFF (hot reload)
cd apps/bff && npm run dev

# Web (hot reload)
cd apps/web && npm run dev

# Run BFF tests
cd apps/bff && npm test
```
