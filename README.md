# CDC Platform

Change Data Capture platform for learning — captures database changes from PostgreSQL and MySQL via Debezium, streams through Kafka, and sinks to MinIO. Includes a management panel and observability stack.

## Architecture

```
PostgreSQL/MySQL → Debezium → Kafka → S3 Sink → MinIO (raw/)
                                ↕
                        Apicurio Schema Registry

React → Node BFF → Kafka Connect API / Database APIs / MinIO / Prometheus
Prometheus + Grafana + Loki + Promtail → Observability
```

## Stack

| Component | Technology |
|-----------|-----------|
| Databases | PostgreSQL 16, MySQL 8 |
| CDC | Debezium 2.5 |
| Streaming | Apache Kafka 3.7 (KRaft) |
| Schema | Apicurio Registry 2 (BACKWARD compat) |
| Storage | MinIO (JSON, partitioned by table/date) |
| Backend | Node.js + Fastify (BFF) |
| Frontend | React + Vite + Shadcn/ui |
| Monitoring | Prometheus + Grafana + Loki + Promtail |

## Quick Start

```bash
# 1. Start infrastructure
cd docker && docker compose -f compose.infra.yml up -d

# 2. Register CDC connectors
./connectors/register-all.sh

# 3. Start observability
docker compose -f compose.observability.yml up -d

# 4. Start application
docker compose -f compose.app.yml up -d
```

## URLs

| Service | URL |
|---------|-----|
| Web Panel | http://localhost:5173 |
| BFF API | http://localhost:3001/api |
| Grafana | http://localhost:3000 (admin/admin) |
| Kafka Connect | http://localhost:8083 |
| Schema Registry | http://localhost:8080 |
| MinIO Console | http://localhost:9001 (minioadmin/minioadmin) |
| Prometheus | http://localhost:9090 |

## Development

```bash
# BFF (hot reload)
cd apps/bff && npm run dev

# Web (hot reload)
cd apps/web && npm run dev

# Run BFF tests
cd apps/bff && npm test
```
