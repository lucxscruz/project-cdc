# CDC Platform

Change Data Capture platform for learning — captures database changes from PostgreSQL and MySQL via Debezium, streams through Redpanda, and sinks to MinIO. Includes a management panel and observability stack.

## Architecture

```
PostgreSQL/MySQL → Debezium → Redpanda → S3 Sink → MinIO (raw/)

React → Node BFF → Kafka Connect API / Database APIs / MinIO / Prometheus
Prometheus + Grafana + Loki + Promtail → Observability
```

## Stack

| Component | Technology |
|-----------|-----------|
| Databases | PostgreSQL 16, MySQL 8 |
| CDC | Debezium 2.5 |
| Streaming | Redpanda (Kafka-compatible broker + Schema Registry) |
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
| Redpanda Console | http://localhost:8080 |
| MinIO Console | http://localhost:19001 (minioadmin/minioadmin) |
| MinIO API | http://localhost:19000 |
| Prometheus | http://localhost:9090 |

## Port Notes

Some host ports differ from container ports to avoid local conflicts:

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| MySQL | 3307 | 3306 |
| MinIO API | 19000 | 9000 |
| MinIO Console | 19001 | 9001 |

## Development

```bash
# BFF (hot reload)
cd apps/bff && npm run dev

# Web (hot reload)
cd apps/web && npm run dev

# Run BFF tests
cd apps/bff && npm test
```
