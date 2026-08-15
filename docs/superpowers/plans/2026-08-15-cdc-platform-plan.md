# CDC Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a containerized CDC platform that captures changes from PostgreSQL and MySQL via Debezium, streams through Kafka, sinks to MinIO, with a React management panel and full observability stack.

**Architecture:** Three Docker Compose layers (infra, observability, app) sharing a bridge network. Debezium captures WAL/binlog changes, publishes to Kafka with schemas in Apicurio Registry, and an S3 Sink Connector writes JSON to MinIO. A Fastify BFF encapsulates all service APIs for a React frontend. Prometheus + Grafana + Loki provide metrics and centralized logs.

**Tech Stack:** PostgreSQL 16, MySQL 8, Apache Kafka 3.7 (KRaft), Debezium 2.5, Apicurio Registry 2, MinIO, Fastify (TypeScript), React 18 (Vite + Shadcn/ui + TanStack Query), Prometheus, Grafana, Loki, Promtail

**Spec:** `docs/superpowers/specs/2026-08-15-cdc-platform-design.md`

## Global Constraints

- Docker Compose v2 syntax (no `version` field)
- All services join `cdc-network` (bridge driver)
- `compose.infra.yml` creates the network; others use `external: true`
- Boot order: infra → observability → app
- Schema compatibility mode: BACKWARD
- MinIO bucket: `raw`, path: `{database}.{table}/{ds}/`
- JSON format everywhere (MinIO sink, schema registry converter)
- Node.js 20 LTS, React 18, TypeScript 5
- No authentication/authorization
- Single Kafka broker, single Kafka Connect worker

---

### Task 1: Database Init Scripts and Core Infrastructure

**Files:**
- Create: `docker/config/postgres/init.sql`
- Create: `docker/config/mysql/init.sql`
- Create: `docker/compose.infra.yml`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: running PostgreSQL (:5432), MySQL (:3306), Kafka (:9092), Apicurio (:8080), MinIO (:9000/:9001), Kafka Connect (:8083) — all on `cdc-network`

- [ ] **Step 1: Create PostgreSQL init script**

Create `docker/config/postgres/init.sql`:

```sql
-- Enable logical replication (set via command args, this script handles schema)

-- Create replication user for Debezium
CREATE ROLE debezium WITH LOGIN PASSWORD 'debezium' REPLICATION;

-- Create application database
CREATE DATABASE cdc_source;
\c cdc_source;

-- Grant permissions to debezium user
GRANT ALL PRIVILEGES ON DATABASE cdc_source TO debezium;

-- Create tables
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    category VARCHAR(100)
);

-- Grant table permissions to debezium
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium;

-- Create publication for Debezium
CREATE PUBLICATION debezium_publication FOR ALL TABLES;

-- Seed data
INSERT INTO customers (name, email) VALUES
    ('Alice Silva', 'alice@example.com'),
    ('Bob Santos', 'bob@example.com'),
    ('Carol Oliveira', 'carol@example.com');

INSERT INTO products (name, price, stock, category) VALUES
    ('Notebook', 2999.99, 50, 'electronics'),
    ('Mouse', 79.90, 200, 'electronics'),
    ('Cadeira Gamer', 1299.00, 30, 'furniture');

INSERT INTO orders (customer_id, total, status) VALUES
    (1, 3079.89, 'completed'),
    (2, 79.90, 'pending'),
    (3, 1299.00, 'shipped');
```

- [ ] **Step 2: Create MySQL init script**

Create `docker/config/mysql/init.sql`:

```sql
-- Create application database
CREATE DATABASE IF NOT EXISTS cdc_source;
USE cdc_source;

-- Create debezium user with replication permissions
CREATE USER IF NOT EXISTS 'debezium'@'%' IDENTIFIED BY 'debezium';
GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'debezium'@'%';
FLUSH PRIVILEGES;

-- Create tables
CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    salary DECIMAL(10,2) NOT NULL,
    hired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    budget DECIMAL(12,2) NOT NULL,
    location VARCHAR(255)
);

CREATE TABLE audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    payload JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed data
INSERT INTO departments (name, budget, location) VALUES
    ('Engineering', 500000.00, 'Sao Paulo'),
    ('Marketing', 200000.00, 'Rio de Janeiro'),
    ('Finance', 300000.00, 'Sao Paulo');

INSERT INTO employees (name, department, salary) VALUES
    ('Daniel Costa', 'Engineering', 12000.00),
    ('Elena Souza', 'Marketing', 8500.00),
    ('Felipe Lima', 'Finance', 10000.00);

INSERT INTO audit_log (entity, action, payload) VALUES
    ('employees', 'INSERT', '{"id": 1, "name": "Daniel Costa"}'),
    ('departments', 'INSERT', '{"id": 1, "name": "Engineering"}');
```

- [ ] **Step 3: Create JMX Exporter config for Kafka**

Create `docker/config/kafka-connect/jmx-exporter-config.yml`:

```yaml
startDelaySeconds: 0
lowercaseOutputName: true
lowercaseOutputLabelNames: true
rules:
  # Kafka Connect metrics
  - pattern: "kafka.connect<type=connect-metrics, client-id=(.+)><>(.+):"
    name: "kafka_connect_$2"
    labels:
      client_id: "$1"
  - pattern: "kafka.connect<type=connector-metrics, connector=(.+)><>(.+):"
    name: "kafka_connect_connector_$2"
    labels:
      connector: "$1"
  - pattern: "kafka.connect<type=connector-task-metrics, connector=(.+), task=(.+)><>(.+):"
    name: "kafka_connect_connector_task_$3"
    labels:
      connector: "$1"
      task: "$2"
  # Source task metrics (Debezium)
  - pattern: "kafka.connect<type=source-task-metrics, connector=(.+), task=(.+)><>(.+):"
    name: "kafka_connect_source_task_$3"
    labels:
      connector: "$1"
      task: "$2"
  # Sink task metrics
  - pattern: "kafka.connect<type=sink-task-metrics, connector=(.+), task=(.+)><>(.+):"
    name: "kafka_connect_sink_task_$3"
    labels:
      connector: "$1"
      task: "$2"
```

- [ ] **Step 4: Create MinIO init script**

Create `docker/config/minio/init.sh`:

```bash
#!/bin/sh
# Wait for MinIO to be ready
sleep 5

# Configure mc client
mc alias set local http://minio:9000 minioadmin minioadmin

# Create the raw bucket
mc mb local/raw --ignore-existing

echo "MinIO bucket 'raw' created successfully"
```

- [ ] **Step 5: Create compose.infra.yml**

Create `docker/compose.infra.yml`:

```yaml
networks:
  cdc-network:
    driver: bridge

services:
  postgres:
    image: postgres:16
    container_name: cdc-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    command: ["postgres", "-c", "wal_level=logical", "-c", "max_wal_senders=4", "-c", "max_replication_slots=4"]
    volumes:
      - ./config/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

  mysql:
    image: mysql:8
    container_name: cdc-mysql
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root
    command: ["--binlog-format=ROW", "--binlog-row-image=FULL", "--server-id=1", "--log-bin=mysql-bin"]
    volumes:
      - ./config/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

  kafka:
    image: apache/kafka:3.7.0
    container_name: cdc-kafka
    ports:
      - "9092:9092"
      - "9404:9404"
    environment:
      # KRaft settings
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      # Listeners
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      # Cluster
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      # JMX Exporter
      KAFKA_OPTS: "-javaagent:/opt/jmx-exporter/jmx_prometheus_javaagent.jar=9404:/opt/jmx-exporter/kafka-config.yml"
    volumes:
      - kafka_data:/var/lib/kafka/data
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-metadata.sh --snapshot /var/lib/kafka/data/__cluster_metadata-0/00000000000000000000.log --cluster-id MkU3OEVBNTcwNTJENDM2Qk 2>/dev/null || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 5
    networks:
      - cdc-network

  schema-registry:
    image: apicurio/apicurio-registry:2.6.4.Final
    container_name: cdc-schema-registry
    ports:
      - "8080:8080"
    environment:
      REGISTRY_STORAGE_KIND: mem
      QUARKUS_HTTP_PORT: 8080
    depends_on:
      kafka:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

  kafka-connect:
    image: debezium/connect:2.5
    container_name: cdc-kafka-connect
    ports:
      - "8083:8083"
      - "9405:9405"
    environment:
      GROUP_ID: 1
      BOOTSTRAP_SERVERS: kafka:9092
      CONFIG_STORAGE_TOPIC: connect_configs
      OFFSET_STORAGE_TOPIC: connect_offsets
      STATUS_STORAGE_TOPIC: connect_statuses
      CONFIG_STORAGE_REPLICATION_FACTOR: 1
      OFFSET_STORAGE_REPLICATION_FACTOR: 1
      STATUS_STORAGE_REPLICATION_FACTOR: 1
      # Schema Registry (Apicurio)
      KEY_CONVERTER: io.apicurio.registry.utils.converter.ExtJsonConverter
      VALUE_CONVERTER: io.apicurio.registry.utils.converter.ExtJsonConverter
      CONNECT_KEY_CONVERTER_APICURIO_REGISTRY_URL: http://schema-registry:8080/apis/registry/v2
      CONNECT_VALUE_CONVERTER_APICURIO_REGISTRY_URL: http://schema-registry:8080/apis/registry/v2
      CONNECT_KEY_CONVERTER_APICURIO_REGISTRY_AUTO_REGISTER: "true"
      CONNECT_VALUE_CONVERTER_APICURIO_REGISTRY_AUTO_REGISTER: "true"
      # JMX Exporter
      KAFKA_OPTS: "-javaagent:/opt/jmx-exporter/jmx_prometheus_javaagent.jar=9405:/opt/jmx-exporter/jmx-exporter-config.yml"
    volumes:
      - ./config/kafka-connect/jmx-exporter-config.yml:/opt/jmx-exporter/jmx-exporter-config.yml
    depends_on:
      kafka:
        condition: service_healthy
      schema-registry:
        condition: service_healthy
      postgres:
        condition: service_healthy
      mysql:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8083/connectors"]
      interval: 15s
      timeout: 10s
      retries: 10
    networks:
      - cdc-network

  minio:
    image: minio/minio
    container_name: cdc-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

  minio-init:
    image: minio/mc
    container_name: cdc-minio-init
    entrypoint: /bin/sh
    command: /init.sh
    volumes:
      - ./config/minio/init.sh:/init.sh
    depends_on:
      minio:
        condition: service_healthy
    networks:
      - cdc-network

volumes:
  postgres_data:
  mysql_data:
  kafka_data:
  minio_data:
```

- [ ] **Step 6: Start infra and verify all services are healthy**

Run:
```bash
cd docker && docker compose -f compose.infra.yml up -d
```

Wait for services, then verify:
```bash
docker compose -f compose.infra.yml ps
```

Expected: all services show `healthy` status. Then verify individually:

```bash
# PostgreSQL
docker exec cdc-postgres psql -U postgres -d cdc_source -c "SELECT count(*) FROM customers;"
# Expected: 3

# MySQL
docker exec cdc-mysql mysql -uroot -proot -e "SELECT count(*) FROM cdc_source.employees;"
# Expected: 3

# Kafka
docker exec cdc-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
# Expected: empty list or internal topics only

# Schema Registry
curl http://localhost:8080/health
# Expected: {"status": "UP"}

# Kafka Connect
curl http://localhost:8083/connectors
# Expected: []

# MinIO bucket
docker run --rm --network docker_cdc-network minio/mc alias set local http://minio:9000 minioadmin minioadmin && mc ls local/raw
# Expected: bucket exists
```

- [ ] **Step 7: Commit**

```bash
git add docker/
git commit -m "feat: add compose.infra.yml with Postgres, MySQL, Kafka KRaft, Apicurio, Kafka Connect, MinIO"
```

---

### Task 2: Debezium Source Connectors and S3 Sink Connector

**Files:**
- Create: `docker/connectors/register-postgres-source.json`
- Create: `docker/connectors/register-mysql-source.json`
- Create: `docker/connectors/register-s3-sink-postgres.json`
- Create: `docker/connectors/register-s3-sink-mysql.json`
- Create: `docker/connectors/register-all.sh`

**Interfaces:**
- Consumes: running Kafka Connect (:8083), PostgreSQL (:5432), MySQL (:3306), MinIO (:9000), Apicurio (:8080) from Task 1
- Produces: CDC events flowing from databases → Kafka topics → MinIO `raw/` bucket with path `{database}.{table}/{ds}/`

- [ ] **Step 1: Create PostgreSQL source connector config**

Create `docker/connectors/register-postgres-source.json`:

```json
{
  "name": "postgres-source",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "debezium",
    "database.dbname": "cdc_source",
    "topic.prefix": "pg",
    "schema.include.list": "public",
    "table.include.list": "public.customers,public.orders,public.products",
    "plugin.name": "pgoutput",
    "publication.name": "debezium_publication",
    "slot.name": "debezium_slot",
    "snapshot.mode": "initial",
    "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "key.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "key.converter.apicurio.registry.auto-register": "true",
    "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "value.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "value.converter.apicurio.registry.auto-register": "true"
  }
}
```

- [ ] **Step 2: Create MySQL source connector config**

Create `docker/connectors/register-mysql-source.json`:

```json
{
  "name": "mysql-source",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "mysql",
    "database.port": "3306",
    "database.user": "debezium",
    "database.password": "debezium",
    "database.server.id": "1001",
    "topic.prefix": "mysql",
    "database.include.list": "cdc_source",
    "table.include.list": "cdc_source.employees,cdc_source.departments,cdc_source.audit_log",
    "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
    "schema.history.internal.kafka.topic": "schema-changes.mysql",
    "snapshot.mode": "initial",
    "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "key.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "key.converter.apicurio.registry.auto-register": "true",
    "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "value.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "value.converter.apicurio.registry.auto-register": "true"
  }
}
```

- [ ] **Step 3: Create S3 Sink connector for PostgreSQL topics**

Create `docker/connectors/register-s3-sink-postgres.json`:

```json
{
  "name": "s3-sink-postgres",
  "config": {
    "connector.class": "io.confluent.connect.s3.S3SinkConnector",
    "tasks.max": "1",
    "topics.regex": "pg\\..*",
    "s3.bucket.name": "raw",
    "s3.region": "us-east-1",
    "store.url": "http://minio:9000",
    "format.class": "io.confluent.connect.s3.format.json.JsonFormat",
    "flush.size": "100",
    "rotate.schedule.interval.ms": "60000",
    "partitioner.class": "io.confluent.connect.storage.partitioner.DailyPartitioner",
    "path.format": "'${topic}/'YYYY-MM-dd",
    "locale": "en-US",
    "timezone": "UTC",
    "storage.class": "io.confluent.connect.s3.storage.S3Storage",
    "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "key.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "value.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "aws.access.key.id": "minioadmin",
    "aws.secret.access.key": "minioadmin"
  }
}
```

- [ ] **Step 4: Create S3 Sink connector for MySQL topics**

Create `docker/connectors/register-s3-sink-mysql.json`:

```json
{
  "name": "s3-sink-mysql",
  "config": {
    "connector.class": "io.confluent.connect.s3.S3SinkConnector",
    "tasks.max": "1",
    "topics.regex": "mysql\\..*",
    "s3.bucket.name": "raw",
    "s3.region": "us-east-1",
    "store.url": "http://minio:9000",
    "format.class": "io.confluent.connect.s3.format.json.JsonFormat",
    "flush.size": "100",
    "rotate.schedule.interval.ms": "60000",
    "partitioner.class": "io.confluent.connect.storage.partitioner.DailyPartitioner",
    "path.format": "'${topic}/'YYYY-MM-dd",
    "locale": "en-US",
    "timezone": "UTC",
    "storage.class": "io.confluent.connect.s3.storage.S3Storage",
    "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "key.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
    "value.converter.apicurio.registry.url": "http://schema-registry:8080/apis/registry/v2",
    "aws.access.key.id": "minioadmin",
    "aws.secret.access.key": "minioadmin"
  }
}
```

- [ ] **Step 5: Create registration script**

Create `docker/connectors/register-all.sh`:

```bash
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
```

- [ ] **Step 6: Register connectors and verify CDC pipeline**

Run the registration script:
```bash
chmod +x docker/connectors/register-all.sh
./docker/connectors/register-all.sh
```

Expected: all 4 connectors show `RUNNING` state.

Verify Kafka topics were created:
```bash
docker exec cdc-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```
Expected: topics like `pg.public.customers`, `pg.public.orders`, `pg.public.products`, `mysql.cdc_source.employees`, `mysql.cdc_source.departments`, `mysql.cdc_source.audit_log`

Verify data in Kafka (read one event):
```bash
docker exec cdc-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic pg.public.customers \
  --from-beginning --max-messages 1
```
Expected: JSON event with snapshot data for first customer.

Trigger a live CDC event:
```bash
docker exec cdc-postgres psql -U postgres -d cdc_source -c \
  "INSERT INTO customers (name, email) VALUES ('Test CDC', 'test@cdc.com');"
```

Wait 60-90 seconds for S3 Sink flush, then verify MinIO:
```bash
docker exec cdc-minio-init mc ls local/raw/ --recursive
```
Expected: files under paths like `pg.public.customers/2026-08-15/`

- [ ] **Step 7: Verify schemas in Apicurio Registry**

```bash
curl -s http://localhost:8080/apis/registry/v2/search/artifacts | jq '.count'
```
Expected: number > 0 (schemas auto-registered by Debezium)

```bash
curl -s http://localhost:8080/apis/registry/v2/search/artifacts | jq '.artifacts[].id'
```
Expected: artifact IDs corresponding to the table schemas

- [ ] **Step 8: Commit**

```bash
git add docker/connectors/
git commit -m "feat: add Debezium source connectors (PG + MySQL) and S3 sink connectors for MinIO"
```

---

### Task 3: Observability Stack (Prometheus, Grafana, Loki, Promtail)

**Files:**
- Create: `docker/config/prometheus/prometheus.yml`
- Create: `docker/config/loki/loki-config.yml`
- Create: `docker/config/promtail/promtail-config.yml`
- Create: `docker/config/grafana/provisioning/datasources/datasources.yml`
- Create: `docker/config/grafana/provisioning/dashboards/dashboards.yml`
- Create: `docker/config/grafana/dashboards/cdc-pipeline.json`
- Create: `docker/config/grafana/dashboards/infrastructure.json`
- Create: `docker/config/grafana/dashboards/logs-explorer.json`
- Create: `docker/compose.observability.yml`

**Interfaces:**
- Consumes: Kafka JMX (:9404), Kafka Connect JMX (:9405), MinIO metrics (:9000), all container logs via Docker socket — from Task 1/2
- Produces: Prometheus (:9090), Grafana (:3000) with 3 provisioned dashboards, Loki (:3100) with centralized logs

- [ ] **Step 1: Create Prometheus config**

Create `docker/config/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "kafka"
    static_configs:
      - targets: ["kafka:9404"]
        labels:
          service: "kafka"

  - job_name: "kafka-connect"
    static_configs:
      - targets: ["kafka-connect:9405"]
        labels:
          service: "kafka-connect"

  - job_name: "minio"
    metrics_path: /minio/v2/metrics/cluster
    static_configs:
      - targets: ["minio:9000"]
        labels:
          service: "minio"

  - job_name: "bff"
    static_configs:
      - targets: ["bff:3001"]
        labels:
          service: "bff"
    metrics_path: /metrics
```

- [ ] **Step 2: Create Loki config**

Create `docker/config/loki/loki-config.yml`:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: "2020-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 168h

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
```

- [ ] **Step 3: Create Promtail config**

Create `docker/config/promtail/promtail-config.yml`:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ["__meta_docker_container_name"]
        target_label: "container_name"
        regex: "/(.*)"
      - source_labels: ["__meta_docker_container_label_com_docker_compose_service"]
        target_label: "compose_service"
      - source_labels: ["__meta_docker_container_label_com_docker_compose_project"]
        target_label: "compose_project"
```

- [ ] **Step 4: Create Grafana datasources provisioning**

Create `docker/config/grafana/provisioning/datasources/datasources.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
```

- [ ] **Step 5: Create Grafana dashboards provisioning config**

Create `docker/config/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1

providers:
  - name: "CDC Platform"
    orgId: 1
    folder: "CDC Platform"
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
```

- [ ] **Step 6: Create CDC Pipeline dashboard**

Create `docker/config/grafana/dashboards/cdc-pipeline.json`:

```json
{
  "dashboard": {
    "title": "CDC Pipeline",
    "uid": "cdc-pipeline",
    "tags": ["cdc"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Connector Status",
        "type": "stat",
        "gridPos": { "h": 4, "w": 12, "x": 0, "y": 0 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "kafka_connect_connector_status",
            "legendFormat": "{{connector}}"
          }
        ]
      },
      {
        "title": "Source Records Written (rate/min)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(kafka_connect_source_task_source_record_write_total[1m])",
            "legendFormat": "{{connector}}"
          }
        ]
      },
      {
        "title": "Sink Records Written (rate/min)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(kafka_connect_sink_task_sink_record_send_total[1m])",
            "legendFormat": "{{connector}}"
          }
        ]
      },
      {
        "title": "Connect Errors (last 30m)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 24, "x": 0, "y": 12 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(kafka_connect_connector_task_total_errors_logged[5m])",
            "legendFormat": "{{connector}}-task-{{task}}"
          }
        ]
      }
    ],
    "time": { "from": "now-1h", "to": "now" },
    "refresh": "30s"
  }
}
```

- [ ] **Step 7: Create Infrastructure dashboard**

Create `docker/config/grafana/dashboards/infrastructure.json`:

```json
{
  "dashboard": {
    "title": "Infrastructure",
    "uid": "infrastructure",
    "tags": ["infra"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Kafka Messages In (rate/min)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(kafka_server_brokertopicmetrics_messagesin_total[1m])",
            "legendFormat": "messages/min"
          }
        ]
      },
      {
        "title": "Kafka Bytes In (rate/min)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(kafka_server_brokertopicmetrics_bytesin_total[1m])",
            "legendFormat": "bytes/min"
          }
        ]
      },
      {
        "title": "MinIO Storage Used",
        "type": "stat",
        "gridPos": { "h": 4, "w": 8, "x": 0, "y": 8 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "minio_cluster_usage_total_bytes",
            "legendFormat": "total bytes"
          }
        ]
      },
      {
        "title": "MinIO Objects Count",
        "type": "stat",
        "gridPos": { "h": 4, "w": 8, "x": 8, "y": 8 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "minio_cluster_usage_object_total",
            "legendFormat": "objects"
          }
        ]
      },
      {
        "title": "Kafka Connect Tasks Running",
        "type": "stat",
        "gridPos": { "h": 4, "w": 8, "x": 16, "y": 8 },
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "kafka_connect_connector_task_status",
            "legendFormat": "{{connector}}-{{task}}"
          }
        ]
      }
    ],
    "time": { "from": "now-1h", "to": "now" },
    "refresh": "30s"
  }
}
```

- [ ] **Step 8: Create Logs Explorer dashboard**

Create `docker/config/grafana/dashboards/logs-explorer.json`:

```json
{
  "dashboard": {
    "title": "Logs Explorer",
    "uid": "logs-explorer",
    "tags": ["logs"],
    "timezone": "browser",
    "templating": {
      "list": [
        {
          "name": "service",
          "type": "query",
          "datasource": "Loki",
          "query": "label_values(compose_service)",
          "refresh": 2,
          "current": { "text": "All", "value": "$__all" },
          "includeAll": true
        },
        {
          "name": "level",
          "type": "custom",
          "options": [
            { "text": "All", "value": "", "selected": true },
            { "text": "ERROR", "value": "ERROR" },
            { "text": "WARN", "value": "WARN" },
            { "text": "INFO", "value": "INFO" }
          ],
          "current": { "text": "All", "value": "" }
        }
      ]
    },
    "panels": [
      {
        "title": "Log Volume",
        "type": "timeseries",
        "gridPos": { "h": 6, "w": 24, "x": 0, "y": 0 },
        "datasource": "Loki",
        "targets": [
          {
            "expr": "sum(count_over_time({compose_service=~\"$service\"} |~ \"$level\" [1m])) by (compose_service)",
            "legendFormat": "{{compose_service}}"
          }
        ]
      },
      {
        "title": "Log Lines",
        "type": "logs",
        "gridPos": { "h": 16, "w": 24, "x": 0, "y": 6 },
        "datasource": "Loki",
        "targets": [
          {
            "expr": "{compose_service=~\"$service\"} |~ \"$level\""
          }
        ],
        "options": {
          "showTime": true,
          "showLabels": true,
          "showCommonLabels": false,
          "wrapLogMessage": true,
          "enableLogDetails": true,
          "sortOrder": "Descending"
        }
      }
    ],
    "time": { "from": "now-1h", "to": "now" },
    "refresh": "30s"
  }
}
```

- [ ] **Step 9: Create compose.observability.yml**

Create `docker/compose.observability.yml`:

```yaml
networks:
  cdc-network:
    external: true

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: cdc-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=7d"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:9090/-/healthy"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

  loki:
    image: grafana/loki:latest
    container_name: cdc-loki
    ports:
      - "3100:3100"
    volumes:
      - ./config/loki/loki-config.yml:/etc/loki/local-config.yaml
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3100/ready"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

  promtail:
    image: grafana/promtail:latest
    container_name: cdc-promtail
    volumes:
      - ./config/promtail/promtail-config.yml:/etc/promtail/config.yml
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      loki:
        condition: service_healthy
    networks:
      - cdc-network

  grafana:
    image: grafana/grafana:latest
    container_name: cdc-grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
      GF_SECURITY_ALLOW_EMBEDDING: "true"
    volumes:
      - ./config/grafana/provisioning:/etc/grafana/provisioning
      - ./config/grafana/dashboards:/var/lib/grafana/dashboards
      - grafana_data:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_healthy
      loki:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network

volumes:
  prometheus_data:
  loki_data:
  grafana_data:
```

Note: `GF_SECURITY_ALLOW_EMBEDDING: "true"` enables iframe embedding in the React panel (spec section 6.1 Observabilidade).

- [ ] **Step 10: Start observability stack and verify**

Run:
```bash
cd docker && docker compose -f compose.observability.yml up -d
```

Verify:
```bash
# Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
# Expected: kafka, kafka-connect, minio targets (bff will be down until Task 5)

# Grafana
curl -s http://localhost:3000/api/health
# Expected: {"commit":"...","database":"ok","version":"..."}

# Grafana dashboards loaded
curl -s -u admin:admin http://localhost:3000/api/search?type=dash-db | jq '.[].title'
# Expected: "CDC Pipeline", "Infrastructure", "Logs Explorer"

# Loki (via Grafana)
curl -s -u admin:admin "http://localhost:3000/api/datasources/proxy/uid/loki/loki/api/v1/labels"
# Expected: labels including compose_service
```

- [ ] **Step 11: Commit**

```bash
git add docker/config/prometheus/ docker/config/loki/ docker/config/promtail/ docker/config/grafana/ docker/compose.observability.yml
git commit -m "feat: add observability stack with Prometheus, Grafana, Loki, Promtail and 3 dashboards"
```

---

### Task 4: BFF Project Setup, Health and Metrics Modules

**Files:**
- Create: `apps/bff/package.json`
- Create: `apps/bff/tsconfig.json`
- Create: `apps/bff/src/server.ts`
- Create: `apps/bff/src/config.ts`
- Create: `apps/bff/src/routes/health.ts`
- Create: `apps/bff/src/services/health-checker.ts`
- Create: `apps/bff/src/routes/metrics.ts`
- Create: `apps/bff/src/plugins/metrics.ts`
- Create: `apps/bff/tests/routes/health.test.ts`
- Create: `apps/bff/Dockerfile`

**Interfaces:**
- Consumes: PostgreSQL (:5432), MySQL (:3306), Kafka (:9092), Kafka Connect (:8083), MinIO (:9000), Schema Registry (:8080) from Task 1
- Produces:
  - `GET /api/health` → `{ status: string, services: Record<string, { status: 'up' | 'down', latencyMs: number }> }`
  - `GET /api/health/:service` → `{ status: 'up' | 'down', latencyMs: number }`
  - `GET /metrics` → Prometheus text format
  - Fastify instance factory: `buildApp(opts?: FastifyServerOptions): FastifyInstance`

- [ ] **Step 1: Initialize BFF project**

Create `apps/bff/package.json`:

```json
{
  "name": "cdc-bff",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "pg": "^8.13.0",
    "mysql2": "^3.11.0",
    "prom-client": "^15.1.0",
    "kafkajs": "^2.2.4",
    "@aws-sdk/client-s3": "^3.700.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0"
  }
}
```

Create `apps/bff/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Run:
```bash
cd apps/bff && npm install
```

- [ ] **Step 2: Write failing test for health checker**

Create `apps/bff/tests/routes/health.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../../src/routes/health.js";
import { HealthChecker } from "../../src/services/health-checker.js";

describe("GET /api/health", () => {
  const mockChecker: HealthChecker = {
    checkAll: vi.fn().mockResolvedValue({
      postgres: { status: "up", latencyMs: 5 },
      mysql: { status: "up", latencyMs: 3 },
      kafka: { status: "up", latencyMs: 10 },
      "kafka-connect": { status: "up", latencyMs: 8 },
      minio: { status: "up", latencyMs: 4 },
      "schema-registry": { status: "up", latencyMs: 6 },
    }),
    checkService: vi.fn().mockResolvedValue({ status: "up", latencyMs: 5 }),
  };

  it("returns aggregated health status", async () => {
    const app = Fastify();
    app.decorate("healthChecker", mockChecker);
    await app.register(healthRoutes, { prefix: "/api/health" });

    const res = await app.inject({ method: "GET", url: "/api/health" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.services.postgres.status).toBe("up");
    expect(body.services.kafka.status).toBe("up");
  });

  it("returns individual service health", async () => {
    const app = Fastify();
    app.decorate("healthChecker", mockChecker);
    await app.register(healthRoutes, { prefix: "/api/health" });

    const res = await app.inject({
      method: "GET",
      url: "/api/health/postgres",
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("up");
    expect(body.latencyMs).toBeTypeOf("number");
  });

  it("returns 404 for unknown service", async () => {
    (mockChecker.checkService as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Unknown service: unknown")
    );
    const app = Fastify();
    app.decorate("healthChecker", mockChecker);
    await app.register(healthRoutes, { prefix: "/api/health" });

    const res = await app.inject({
      method: "GET",
      url: "/api/health/unknown",
    });

    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
cd apps/bff && npx vitest run tests/routes/health.test.ts
```
Expected: FAIL — modules not found

- [ ] **Step 4: Create config module**

Create `apps/bff/src/config.ts`:

```typescript
export const config = {
  port: parseInt(process.env.PORT ?? "3001"),
  host: process.env.HOST ?? "0.0.0.0",

  postgres: {
    host: process.env.PG_HOST ?? "postgres",
    port: parseInt(process.env.PG_PORT ?? "5432"),
    user: process.env.PG_USER ?? "postgres",
    password: process.env.PG_PASSWORD ?? "postgres",
    database: process.env.PG_DATABASE ?? "cdc_source",
  },

  mysql: {
    host: process.env.MYSQL_HOST ?? "mysql",
    port: parseInt(process.env.MYSQL_PORT ?? "3306"),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "root",
    database: process.env.MYSQL_DATABASE ?? "cdc_source",
  },

  kafkaConnect: {
    url: process.env.KAFKA_CONNECT_URL ?? "http://kafka-connect:8083",
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(","),
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "http://minio:9000",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  },

  schemaRegistry: {
    url:
      process.env.SCHEMA_REGISTRY_URL ??
      "http://schema-registry:8080",
  },
} as const;
```

- [ ] **Step 5: Create health checker service**

Create `apps/bff/src/services/health-checker.ts`:

```typescript
import pg from "pg";
import mysql from "mysql2/promise";
import { config } from "../config.js";

export interface ServiceHealth {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface HealthChecker {
  checkAll(): Promise<Record<string, ServiceHealth>>;
  checkService(name: string): Promise<ServiceHealth>;
}

const VALID_SERVICES = [
  "postgres",
  "mysql",
  "kafka",
  "kafka-connect",
  "minio",
  "schema-registry",
] as const;

type ServiceName = (typeof VALID_SERVICES)[number];

async function timed(
  fn: () => Promise<void>
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await fn();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

const checks: Record<ServiceName, () => Promise<void>> = {
  async postgres() {
    const client = new pg.Client(config.postgres);
    try {
      await client.connect();
      await client.query("SELECT 1");
    } finally {
      await client.end();
    }
  },

  async mysql() {
    const conn = await mysql.createConnection(config.mysql);
    try {
      await conn.query("SELECT 1");
    } finally {
      await conn.end();
    }
  },

  async kafka() {
    const res = await fetch(
      `${config.kafkaConnect.url}/connectors`
    );
    if (!res.ok) throw new Error(`Kafka Connect returned ${res.status}`);
  },

  async "kafka-connect"() {
    const res = await fetch(config.kafkaConnect.url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  },

  async minio() {
    const res = await fetch(
      `${config.minio.endpoint}/minio/health/live`
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
  },

  async "schema-registry"() {
    const res = await fetch(
      `${config.schemaRegistry.url}/health`
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
  },
};

export function createHealthChecker(): HealthChecker {
  return {
    async checkAll() {
      const entries = await Promise.all(
        VALID_SERVICES.map(async (name) => [
          name,
          await timed(checks[name]),
        ])
      );
      return Object.fromEntries(entries);
    },

    async checkService(name: string) {
      if (!VALID_SERVICES.includes(name as ServiceName)) {
        throw new Error(`Unknown service: ${name}`);
      }
      return timed(checks[name as ServiceName]);
    },
  };
}
```

- [ ] **Step 6: Create health routes**

Create `apps/bff/src/routes/health.ts`:

```typescript
import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    const services = await app.healthChecker.checkAll();
    const allUp = Object.values(services).every(
      (s) => s.status === "up"
    );
    const status = allUp ? "healthy" : "degraded";
    const statusCode = allUp ? 200 : 503;

    return reply.status(statusCode).send({ status, services });
  });

  app.get("/:service", async (req, reply) => {
    const { service } = req.params as { service: string };
    try {
      const result = await app.healthChecker.checkService(service);
      return reply.send(result);
    } catch (err) {
      return reply
        .status(404)
        .send({ error: (err as Error).message });
    }
  });
}
```

- [ ] **Step 7: Create metrics plugin**

Create `apps/bff/src/plugins/metrics.ts`:

```typescript
import { FastifyInstance } from "fastify";
import client from "prom-client";

export async function metricsPlugin(app: FastifyInstance) {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpDuration = new client.Histogram({
    name: "bff_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [register],
  });

  const healthGauge = new client.Gauge({
    name: "bff_health_check_status",
    help: "Health check status per service (1=up, 0=down)",
    labelNames: ["service"],
    registers: [register],
  });

  const connectorGauge = new client.Gauge({
    name: "bff_connector_status",
    help: "Connector status (1=running, 0.5=paused, 0=failed)",
    labelNames: ["connector"],
    registers: [register],
  });

  const errorCounter = new client.Counter({
    name: "bff_api_errors_total",
    help: "Total API errors",
    labelNames: ["method", "route"],
    registers: [register],
  });

  app.addHook("onResponse", (req, reply, done) => {
    const route = req.routeOptions?.url ?? req.url;
    if (route !== "/metrics") {
      httpDuration.observe(
        {
          method: req.method,
          route,
          status_code: reply.statusCode.toString(),
        },
        reply.elapsedTime / 1000
      );
      if (reply.statusCode >= 400) {
        errorCounter.inc({ method: req.method, route });
      }
    }
    done();
  });

  app.decorate("metricsGauges", {
    health: healthGauge,
    connector: connectorGauge,
  });

  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });
}
```

- [ ] **Step 8: Create Fastify server entry point**

Create `apps/bff/src/server.ts`:

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { metricsPlugin } from "./plugins/metrics.js";
import { createHealthChecker } from "./services/health-checker.js";

declare module "fastify" {
  interface FastifyInstance {
    healthChecker: import("./services/health-checker.js").HealthChecker;
    metricsGauges: {
      health: import("prom-client").Gauge;
      connector: import("prom-client").Gauge;
    };
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  app.decorate("healthChecker", createHealthChecker());
  await app.register(metricsPlugin);
  await app.register(healthRoutes, { prefix: "/api/health" });

  return app;
}

async function start() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
}

start();
```

- [ ] **Step 9: Run tests to verify they pass**

Run:
```bash
cd apps/bff && npx vitest run tests/routes/health.test.ts
```
Expected: all 3 tests PASS

- [ ] **Step 10: Create Dockerfile**

Create `apps/bff/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

- [ ] **Step 11: Commit**

```bash
git add apps/bff/
git commit -m "feat: add BFF project with health check and Prometheus metrics endpoints"
```

---

### Task 5: BFF Connectors Module

**Files:**
- Create: `apps/bff/src/services/kafka-connect-client.ts`
- Create: `apps/bff/src/routes/connectors.ts`
- Create: `apps/bff/tests/routes/connectors.test.ts`
- Modify: `apps/bff/src/server.ts` — register connectors routes

**Interfaces:**
- Consumes: Kafka Connect REST API (:8083) from Task 1
- Produces:
  - `GET /api/connectors` → `ConnectorSummary[]`
  - `GET /api/connectors/:name` → `ConnectorDetail`
  - `POST /api/connectors` → `{ name: string, config: Record<string, string> }`
  - `PUT /api/connectors/:name` → updated config
  - `DELETE /api/connectors/:name` → 204
  - `POST /api/connectors/:name/restart` → 204
  - `POST /api/connectors/:name/pause` → 204
  - `POST /api/connectors/:name/resume` → 204
  - `KafkaConnectClient` service class

- [ ] **Step 1: Write failing test for connectors routes**

Create `apps/bff/tests/routes/connectors.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { connectorRoutes } from "../../src/routes/connectors.js";
import { KafkaConnectClient } from "../../src/services/kafka-connect-client.js";

function buildMockClient(): KafkaConnectClient {
  return {
    list: vi.fn().mockResolvedValue([
      {
        name: "postgres-source",
        type: "source",
        state: "RUNNING",
        workerId: "connect:8083",
        tasks: [{ id: 0, state: "RUNNING", workerId: "connect:8083" }],
      },
    ]),
    get: vi.fn().mockResolvedValue({
      name: "postgres-source",
      type: "source",
      state: "RUNNING",
      config: { "connector.class": "io.debezium.connector.postgresql.PostgresConnector" },
      tasks: [{ id: 0, state: "RUNNING", workerId: "connect:8083" }],
    }),
    create: vi.fn().mockResolvedValue({ name: "new-connector" }),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  };
}

describe("GET /api/connectors", () => {
  it("returns list of connectors with status", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({ method: "GET", url: "/api/connectors" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("postgres-source");
    expect(body[0].state).toBe("RUNNING");
  });
});

describe("GET /api/connectors/:name", () => {
  it("returns connector detail", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({ method: "GET", url: "/api/connectors/postgres-source" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.name).toBe("postgres-source");
    expect(body.config).toBeDefined();
    expect(body.tasks).toHaveLength(1);
  });
});

describe("POST /api/connectors", () => {
  it("creates a connector", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({
      method: "POST",
      url: "/api/connectors",
      payload: { name: "new-connector", config: { "connector.class": "test" } },
    });

    expect(res.statusCode).toBe(201);
    expect(client.create).toHaveBeenCalledWith({
      name: "new-connector",
      config: { "connector.class": "test" },
    });
  });
});

describe("DELETE /api/connectors/:name", () => {
  it("deletes a connector", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({ method: "DELETE", url: "/api/connectors/postgres-source" });

    expect(res.statusCode).toBe(204);
    expect(client.remove).toHaveBeenCalledWith("postgres-source");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/bff && npx vitest run tests/routes/connectors.test.ts
```
Expected: FAIL — modules not found

- [ ] **Step 3: Create Kafka Connect client service**

Create `apps/bff/src/services/kafka-connect-client.ts`:

```typescript
import { config } from "../config.js";

export interface ConnectorSummary {
  name: string;
  type: string;
  state: string;
  workerId: string;
  tasks: { id: number; state: string; workerId: string }[];
}

export interface ConnectorDetail extends ConnectorSummary {
  config: Record<string, string>;
}

export interface CreateConnectorRequest {
  name: string;
  config: Record<string, string>;
}

export interface KafkaConnectClient {
  list(): Promise<ConnectorSummary[]>;
  get(name: string): Promise<ConnectorDetail>;
  create(body: CreateConnectorRequest): Promise<{ name: string }>;
  update(name: string, config: Record<string, string>): Promise<Record<string, string>>;
  remove(name: string): Promise<void>;
  restart(name: string): Promise<void>;
  pause(name: string): Promise<void>;
  resume(name: string): Promise<void>;
}

export function createKafkaConnectClient(): KafkaConnectClient {
  const baseUrl = config.kafkaConnect.url;

  async function request(path: string, opts?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Kafka Connect ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined;
    return res.json();
  }

  return {
    async list(): Promise<ConnectorSummary[]> {
      const data = await request("/connectors?expand=status&expand=info");
      return Object.entries(data).map(([name, value]: [string, any]) => ({
        name,
        type: value.info?.type ?? "unknown",
        state: value.status?.connector?.state ?? "UNKNOWN",
        workerId: value.status?.connector?.worker_id ?? "",
        tasks: (value.status?.tasks ?? []).map((t: any) => ({
          id: t.id,
          state: t.state,
          workerId: t.worker_id,
        })),
      }));
    },

    async get(name: string): Promise<ConnectorDetail> {
      const [statusRes, configRes] = await Promise.all([
        request(`/connectors/${name}/status`),
        request(`/connectors/${name}/config`),
      ]);
      return {
        name: statusRes.name,
        type: statusRes.type,
        state: statusRes.connector.state,
        workerId: statusRes.connector.worker_id,
        config: configRes,
        tasks: statusRes.tasks.map((t: any) => ({
          id: t.id,
          state: t.state,
          workerId: t.worker_id,
        })),
      };
    },

    async create(body: CreateConnectorRequest) {
      return request("/connectors", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async update(name: string, cfg: Record<string, string>) {
      return request(`/connectors/${name}/config`, {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
    },

    async remove(name: string) {
      await request(`/connectors/${name}`, { method: "DELETE" });
    },

    async restart(name: string) {
      await request(`/connectors/${name}/restart`, { method: "POST" });
    },

    async pause(name: string) {
      await request(`/connectors/${name}/pause`, { method: "PUT" });
    },

    async resume(name: string) {
      await request(`/connectors/${name}/resume`, { method: "PUT" });
    },
  };
}
```

- [ ] **Step 4: Create connector routes**

Create `apps/bff/src/routes/connectors.ts`:

```typescript
import { FastifyInstance } from "fastify";

export async function connectorRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.kafkaConnectClient.list();
  });

  app.get("/:name", async (req) => {
    const { name } = req.params as { name: string };
    return app.kafkaConnectClient.get(name);
  });

  app.post("/", async (req, reply) => {
    const body = req.body as { name: string; config: Record<string, string> };
    const result = await app.kafkaConnectClient.create(body);
    return reply.status(201).send(result);
  });

  app.put("/:name", async (req) => {
    const { name } = req.params as { name: string };
    const config = req.body as Record<string, string>;
    return app.kafkaConnectClient.update(name, config);
  });

  app.delete("/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.remove(name);
    return reply.status(204).send();
  });

  app.post("/:name/restart", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.restart(name);
    return reply.status(204).send();
  });

  app.post("/:name/pause", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.pause(name);
    return reply.status(204).send();
  });

  app.post("/:name/resume", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.resume(name);
    return reply.status(204).send();
  });
}
```

- [ ] **Step 5: Register connectors routes in server.ts**

Modify `apps/bff/src/server.ts` — add import and registration:

```typescript
import { connectorRoutes } from "./routes/connectors.js";
import { createKafkaConnectClient } from "./services/kafka-connect-client.js";
```

Add to `buildApp()` function, after healthChecker decorator:

```typescript
app.decorate("kafkaConnectClient", createKafkaConnectClient());
await app.register(connectorRoutes, { prefix: "/api/connectors" });
```

Update the `FastifyInstance` declaration to include:

```typescript
kafkaConnectClient: import("./services/kafka-connect-client.js").KafkaConnectClient;
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd apps/bff && npx vitest run
```
Expected: all tests PASS (health + connectors)

- [ ] **Step 7: Commit**

```bash
git add apps/bff/
git commit -m "feat: add BFF connectors module with Kafka Connect client"
```

---

### Task 6: BFF Databases and Templates Modules

**Files:**
- Create: `apps/bff/src/services/database-client.ts`
- Create: `apps/bff/src/routes/databases.ts`
- Create: `apps/bff/src/services/template-engine.ts`
- Create: `apps/bff/src/routes/templates.ts`
- Create: `apps/bff/tests/routes/databases.test.ts`
- Create: `apps/bff/tests/routes/templates.test.ts`
- Modify: `apps/bff/src/server.ts` — register new routes

**Interfaces:**
- Consumes: PostgreSQL (:5432), MySQL (:3306) from Task 1; config from Task 4
- Produces:
  - `GET /api/databases` → `DatabaseInfo[]`
  - `GET /api/databases/:db/tables` → `TableInfo[]`
  - `GET /api/databases/:db/tables/:table/columns` → `ColumnInfo[]`
  - `GET /api/databases/:db/tables/:table/preview` → `{ columns: string[], rows: any[] }`
  - `GET /api/templates` → `TemplateInfo[]`
  - `POST /api/templates/generate` → `{ name: string, config: Record<string, string> }`
  - `DatabaseClient` and `TemplateEngine` interfaces

- [ ] **Step 1: Write failing test for databases routes**

Create `apps/bff/tests/routes/databases.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { databaseRoutes } from "../../src/routes/databases.js";
import { DatabaseClient } from "../../src/services/database-client.js";

function buildMockDbClient(): DatabaseClient {
  return {
    listDatabases: vi.fn().mockResolvedValue([
      { name: "postgres", type: "postgresql", host: "postgres", port: 5432 },
      { name: "mysql", type: "mysql", host: "mysql", port: 3306 },
    ]),
    listTables: vi.fn().mockResolvedValue([
      { name: "customers", schema: "public", rowCount: 3 },
      { name: "orders", schema: "public", rowCount: 3 },
    ]),
    listColumns: vi.fn().mockResolvedValue([
      { name: "id", type: "integer", nullable: false, isPrimaryKey: true },
      { name: "name", type: "varchar", nullable: false, isPrimaryKey: false },
      { name: "email", type: "varchar", nullable: false, isPrimaryKey: false },
    ]),
    preview: vi.fn().mockResolvedValue({
      columns: ["id", "name", "email"],
      rows: [{ id: 1, name: "Alice", email: "alice@example.com" }],
    }),
  };
}

describe("GET /api/databases", () => {
  it("returns list of configured databases", async () => {
    const app = Fastify();
    app.decorate("databaseClient", buildMockDbClient());
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({ method: "GET", url: "/api/databases" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });
});

describe("GET /api/databases/:db/tables", () => {
  it("returns tables for a database", async () => {
    const app = Fastify();
    const client = buildMockDbClient();
    app.decorate("databaseClient", client);
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({ method: "GET", url: "/api/databases/postgres/tables" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(client.listTables).toHaveBeenCalledWith("postgres");
  });
});

describe("GET /api/databases/:db/tables/:table/columns", () => {
  it("returns columns for a table", async () => {
    const app = Fastify();
    const client = buildMockDbClient();
    app.decorate("databaseClient", client);
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({
      method: "GET",
      url: "/api/databases/postgres/tables/customers/columns",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
    expect(res.json()[0].isPrimaryKey).toBe(true);
  });
});

describe("GET /api/databases/:db/tables/:table/preview", () => {
  it("returns preview rows", async () => {
    const app = Fastify();
    const client = buildMockDbClient();
    app.decorate("databaseClient", client);
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({
      method: "GET",
      url: "/api/databases/postgres/tables/customers/preview",
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.columns).toContain("id");
    expect(body.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write failing test for templates routes**

Create `apps/bff/tests/routes/templates.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { templateRoutes } from "../../src/routes/templates.js";
import { TemplateEngine } from "../../src/services/template-engine.js";

function buildMockEngine(): TemplateEngine {
  return {
    listTemplates: vi.fn().mockReturnValue([
      { id: "debezium-postgres", name: "Debezium PostgreSQL Source", type: "source" },
      { id: "debezium-mysql", name: "Debezium MySQL Source", type: "source" },
      { id: "s3-sink-minio", name: "S3 Sink (MinIO)", type: "sink" },
    ]),
    generate: vi.fn().mockReturnValue({
      name: "pg-customers-source",
      config: {
        "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
        "database.hostname": "postgres",
        "table.include.list": "public.customers",
      },
    }),
  };
}

describe("GET /api/templates", () => {
  it("returns available templates", async () => {
    const app = Fastify();
    app.decorate("templateEngine", buildMockEngine());
    await app.register(templateRoutes, { prefix: "/api/templates" });

    const res = await app.inject({ method: "GET", url: "/api/templates" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
  });
});

describe("POST /api/templates/generate", () => {
  it("generates connector config from template", async () => {
    const app = Fastify();
    const engine = buildMockEngine();
    app.decorate("templateEngine", engine);
    await app.register(templateRoutes, { prefix: "/api/templates" });

    const res = await app.inject({
      method: "POST",
      url: "/api/templates/generate",
      payload: {
        templateId: "debezium-postgres",
        database: "postgres",
        tables: ["public.customers"],
        options: { snapshotMode: "initial", topicPrefix: "pg" },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("pg-customers-source");
    expect(res.json().config["connector.class"]).toContain("PostgresConnector");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
cd apps/bff && npx vitest run tests/routes/databases.test.ts tests/routes/templates.test.ts
```
Expected: FAIL — modules not found

- [ ] **Step 4: Create database client service**

Create `apps/bff/src/services/database-client.ts`:

```typescript
import pg from "pg";
import mysql from "mysql2/promise";
import { config } from "../config.js";

export interface DatabaseInfo {
  name: string;
  type: "postgresql" | "mysql";
  host: string;
  port: number;
}

export interface TableInfo {
  name: string;
  schema: string;
  rowCount: number | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface PreviewResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface DatabaseClient {
  listDatabases(): Promise<DatabaseInfo[]>;
  listTables(db: string): Promise<TableInfo[]>;
  listColumns(db: string, table: string): Promise<ColumnInfo[]>;
  preview(db: string, table: string, limit?: number): Promise<PreviewResult>;
}

const DATABASES: Record<string, { type: "postgresql" | "mysql" }> = {
  postgres: { type: "postgresql" },
  mysql: { type: "mysql" },
};

export function createDatabaseClient(): DatabaseClient {
  async function withPg<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client(config.postgres);
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async function withMysql<T>(
    fn: (conn: mysql.Connection) => Promise<T>
  ): Promise<T> {
    const conn = await mysql.createConnection(config.mysql);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  return {
    async listDatabases(): Promise<DatabaseInfo[]> {
      return [
        { name: "postgres", type: "postgresql", host: config.postgres.host, port: config.postgres.port },
        { name: "mysql", type: "mysql", host: config.mysql.host, port: config.mysql.port },
      ];
    },

    async listTables(db: string): Promise<TableInfo[]> {
      if (db === "postgres") {
        return withPg(async (client) => {
          const res = await client.query(`
            SELECT t.table_name as name, t.table_schema as schema,
                   s.n_live_tup as row_count
            FROM information_schema.tables t
            LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
          `);
          return res.rows.map((r) => ({
            name: r.name,
            schema: r.schema,
            rowCount: r.row_count ? Number(r.row_count) : null,
          }));
        });
      }
      return withMysql(async (conn) => {
        const [rows] = await conn.query(`
          SELECT TABLE_NAME as name, TABLE_SCHEMA as \`schema\`,
                 TABLE_ROWS as row_count
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME
        `, [config.mysql.database]);
        return (rows as any[]).map((r) => ({
          name: r.name,
          schema: r.schema,
          rowCount: r.row_count ? Number(r.row_count) : null,
        }));
      });
    },

    async listColumns(db: string, table: string): Promise<ColumnInfo[]> {
      if (db === "postgres") {
        return withPg(async (client) => {
          const res = await client.query(`
            SELECT c.column_name as name, c.data_type as type,
                   c.is_nullable = 'YES' as nullable,
                   COALESCE(tc.constraint_type = 'PRIMARY KEY', false) as is_primary_key
            FROM information_schema.columns c
            LEFT JOIN information_schema.key_column_usage kcu
              ON kcu.column_name = c.column_name AND kcu.table_name = c.table_name
            LEFT JOIN information_schema.table_constraints tc
              ON tc.constraint_name = kcu.constraint_name AND tc.constraint_type = 'PRIMARY KEY'
            WHERE c.table_schema = 'public' AND c.table_name = $1
            ORDER BY c.ordinal_position
          `, [table]);
          return res.rows.map((r) => ({
            name: r.name,
            type: r.type,
            nullable: r.nullable,
            isPrimaryKey: r.is_primary_key,
          }));
        });
      }
      return withMysql(async (conn) => {
        const [rows] = await conn.query(`
          SELECT COLUMN_NAME as name, DATA_TYPE as type,
                 IS_NULLABLE = 'YES' as nullable,
                 COLUMN_KEY = 'PRI' as is_primary_key
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [config.mysql.database, table]);
        return (rows as any[]).map((r) => ({
          name: r.name,
          type: r.type,
          nullable: Boolean(r.nullable),
          isPrimaryKey: Boolean(r.is_primary_key),
        }));
      });
    },

    async preview(db: string, table: string, limit = 50): Promise<PreviewResult> {
      if (db === "postgres") {
        return withPg(async (client) => {
          const res = await client.query(
            `SELECT * FROM "${table}" LIMIT $1`, [limit]
          );
          return {
            columns: res.fields.map((f) => f.name),
            rows: res.rows,
          };
        });
      }
      return withMysql(async (conn) => {
        const [rows, fields] = await conn.query(
          `SELECT * FROM \`${table}\` LIMIT ?`, [limit]
        );
        return {
          columns: (fields as any[]).map((f) => f.name),
          rows: rows as any[],
        };
      });
    },
  };
}
```

- [ ] **Step 5: Create database routes**

Create `apps/bff/src/routes/databases.ts`:

```typescript
import { FastifyInstance } from "fastify";

export async function databaseRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.databaseClient.listDatabases();
  });

  app.get("/:db/tables", async (req) => {
    const { db } = req.params as { db: string };
    return app.databaseClient.listTables(db);
  });

  app.get("/:db/tables/:table/columns", async (req) => {
    const { db, table } = req.params as { db: string; table: string };
    return app.databaseClient.listColumns(db, table);
  });

  app.get("/:db/tables/:table/preview", async (req) => {
    const { db, table } = req.params as { db: string; table: string };
    return app.databaseClient.preview(db, table);
  });
}
```

- [ ] **Step 6: Create template engine service**

Create `apps/bff/src/services/template-engine.ts`:

```typescript
import { config } from "../config.js";

export interface TemplateInfo {
  id: string;
  name: string;
  type: "source" | "sink";
}

export interface GenerateRequest {
  templateId: string;
  database: string;
  tables: string[];
  options?: {
    snapshotMode?: string;
    topicPrefix?: string;
    connectorName?: string;
  };
}

export interface GeneratedConnector {
  name: string;
  config: Record<string, string>;
}

export interface TemplateEngine {
  listTemplates(): TemplateInfo[];
  generate(request: GenerateRequest): GeneratedConnector;
}

const TEMPLATES: TemplateInfo[] = [
  { id: "debezium-postgres", name: "Debezium PostgreSQL Source", type: "source" },
  { id: "debezium-mysql", name: "Debezium MySQL Source", type: "source" },
  { id: "s3-sink-minio", name: "S3 Sink (MinIO)", type: "sink" },
];

export function createTemplateEngine(): TemplateEngine {
  return {
    listTemplates() {
      return TEMPLATES;
    },

    generate(request: GenerateRequest): GeneratedConnector {
      const { templateId, database, tables, options = {} } = request;
      const prefix = options.topicPrefix ?? database;
      const snapshot = options.snapshotMode ?? "initial";

      switch (templateId) {
        case "debezium-postgres": {
          const name = options.connectorName ?? `${prefix}-pg-source`;
          return {
            name,
            config: {
              "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
              "database.hostname": config.postgres.host,
              "database.port": String(config.postgres.port),
              "database.user": "debezium",
              "database.password": "debezium",
              "database.dbname": config.postgres.database,
              "topic.prefix": prefix,
              "schema.include.list": "public",
              "table.include.list": tables.join(","),
              "plugin.name": "pgoutput",
              "publication.name": "debezium_publication",
              "slot.name": `debezium_${name.replace(/[^a-z0-9]/g, "_")}`,
              "snapshot.mode": snapshot,
              "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "key.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "key.converter.apicurio.registry.auto-register": "true",
              "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "value.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "value.converter.apicurio.registry.auto-register": "true",
            },
          };
        }

        case "debezium-mysql": {
          const name = options.connectorName ?? `${prefix}-mysql-source`;
          return {
            name,
            config: {
              "connector.class": "io.debezium.connector.mysql.MySqlConnector",
              "database.hostname": config.mysql.host,
              "database.port": String(config.mysql.port),
              "database.user": "debezium",
              "database.password": "debezium",
              "database.server.id": String(1001 + Math.floor(Math.random() * 1000)),
              "topic.prefix": prefix,
              "database.include.list": config.mysql.database,
              "table.include.list": tables.join(","),
              "schema.history.internal.kafka.bootstrap.servers": config.kafka.brokers.join(","),
              "schema.history.internal.kafka.topic": `schema-changes.${name}`,
              "snapshot.mode": snapshot,
              "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "key.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "key.converter.apicurio.registry.auto-register": "true",
              "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "value.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "value.converter.apicurio.registry.auto-register": "true",
            },
          };
        }

        case "s3-sink-minio": {
          const name = options.connectorName ?? `${prefix}-s3-sink`;
          const topicsRegex = tables
            .map((t) => `${prefix}\\.${t.replace(".", "\\\\.")}`)
            .join("|");
          return {
            name,
            config: {
              "connector.class": "io.confluent.connect.s3.S3SinkConnector",
              "tasks.max": "1",
              "topics.regex": topicsRegex,
              "s3.bucket.name": "raw",
              "s3.region": "us-east-1",
              "store.url": config.minio.endpoint,
              "format.class": "io.confluent.connect.s3.format.json.JsonFormat",
              "flush.size": "100",
              "rotate.schedule.interval.ms": "60000",
              "partitioner.class": "io.confluent.connect.storage.partitioner.DailyPartitioner",
              "path.format": "'${topic}/'YYYY-MM-dd",
              "locale": "en-US",
              "timezone": "UTC",
              "storage.class": "io.confluent.connect.s3.storage.S3Storage",
              "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "key.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "value.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "aws.access.key.id": config.minio.accessKey,
              "aws.secret.access.key": config.minio.secretKey,
            },
          };
        }

        default:
          throw new Error(`Unknown template: ${templateId}`);
      }
    },
  };
}
```

- [ ] **Step 7: Create template routes**

Create `apps/bff/src/routes/templates.ts`:

```typescript
import { FastifyInstance } from "fastify";
import { GenerateRequest } from "../services/template-engine.js";

export async function templateRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.templateEngine.listTemplates();
  });

  app.post("/generate", async (req) => {
    const body = req.body as GenerateRequest;
    return app.templateEngine.generate(body);
  });
}
```

- [ ] **Step 8: Register new routes in server.ts**

Modify `apps/bff/src/server.ts` — add imports:

```typescript
import { databaseRoutes } from "./routes/databases.js";
import { templateRoutes } from "./routes/templates.js";
import { createDatabaseClient } from "./services/database-client.js";
import { createTemplateEngine } from "./services/template-engine.js";
```

Add to `buildApp()`:

```typescript
app.decorate("databaseClient", createDatabaseClient());
app.decorate("templateEngine", createTemplateEngine());
await app.register(databaseRoutes, { prefix: "/api/databases" });
await app.register(templateRoutes, { prefix: "/api/templates" });
```

Update `FastifyInstance` declaration to include:

```typescript
databaseClient: import("./services/database-client.js").DatabaseClient;
templateEngine: import("./services/template-engine.js").TemplateEngine;
```

- [ ] **Step 9: Run all tests**

Run:
```bash
cd apps/bff && npx vitest run
```
Expected: all tests PASS (health + connectors + databases + templates)

- [ ] **Step 10: Commit**

```bash
git add apps/bff/
git commit -m "feat: add BFF databases and templates modules"
```

---

### Task 7: BFF Docker Integration and compose.app.yml

**Files:**
- Create: `docker/compose.app.yml`
- Verify: `apps/bff/Dockerfile` (created in Task 4)

**Interfaces:**
- Consumes: `cdc-network` from Task 1, BFF application from Tasks 4-6
- Produces: BFF running at `:3001` on `cdc-network`, ready for React frontend

- [ ] **Step 1: Create compose.app.yml**

Create `docker/compose.app.yml`:

```yaml
networks:
  cdc-network:
    external: true

services:
  bff:
    build:
      context: ../apps/bff
      dockerfile: Dockerfile
    container_name: cdc-bff
    ports:
      - "3001:3001"
    environment:
      PORT: "3001"
      PG_HOST: postgres
      PG_PORT: "5432"
      PG_USER: postgres
      PG_PASSWORD: postgres
      PG_DATABASE: cdc_source
      MYSQL_HOST: mysql
      MYSQL_PORT: "3306"
      MYSQL_USER: root
      MYSQL_PASSWORD: root
      MYSQL_DATABASE: cdc_source
      KAFKA_CONNECT_URL: http://kafka-connect:8083
      KAFKA_BROKERS: kafka:9092
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      SCHEMA_REGISTRY_URL: http://schema-registry:8080
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cdc-network
```

- [ ] **Step 2: Build and start BFF container**

Run (with infra already running):
```bash
cd docker && docker compose -f compose.app.yml build && docker compose -f compose.app.yml up -d
```

- [ ] **Step 3: Verify BFF is working**

```bash
# Health check
curl -s http://localhost:3001/api/health | jq '.status'
# Expected: "healthy"

# List connectors
curl -s http://localhost:3001/api/connectors | jq '.[].name'
# Expected: list of connectors registered in Task 2

# List databases
curl -s http://localhost:3001/api/databases | jq '.[].name'
# Expected: ["postgres", "mysql"]

# List tables
curl -s http://localhost:3001/api/databases/postgres/tables | jq '.[].name'
# Expected: ["customers", "orders", "products"]

# Prometheus metrics
curl -s http://localhost:3001/metrics | head -5
# Expected: Prometheus text format metrics
```

- [ ] **Step 4: Commit**

```bash
git add docker/compose.app.yml
git commit -m "feat: add compose.app.yml with BFF service"
```

---

### Task 8: React Project Setup, Layout, and Dashboard Page

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/Layout.tsx`
- Create: `apps/web/src/pages/Dashboard.tsx`
- Create: `apps/web/src/components/dashboard/StatusCard.tsx`
- Create: `apps/web/src/components/dashboard/ServiceHealth.tsx`
- Create: `apps/web/Dockerfile`

**Interfaces:**
- Consumes: BFF API at `:3001` from Tasks 4-6
- Produces: React app at `:5173` with sidebar layout, dashboard page showing connector status cards and service health

- [ ] **Step 1: Initialize React project**

Run:
```bash
cd apps && npm create vite@latest web -- --template react-ts
cd apps/web && npm install
```

Install additional dependencies:
```bash
cd apps/web && npm install @tanstack/react-query react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Vite with proxy to BFF**

Replace `apps/web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

Add to the top of `apps/web/src/index.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 3: Create API client**

Create `apps/web/src/lib/api.ts`:

```typescript
const BASE_URL = "/api";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: {
    getAll: () => request<{
      status: string;
      services: Record<string, { status: string; latencyMs: number }>;
    }>("/health"),
  },

  connectors: {
    list: () => request<Array<{
      name: string;
      type: string;
      state: string;
      tasks: Array<{ id: number; state: string }>;
    }>>("/connectors"),
    get: (name: string) => request<{
      name: string;
      type: string;
      state: string;
      config: Record<string, string>;
      tasks: Array<{ id: number; state: string; workerId: string }>;
    }>(`/connectors/${name}`),
    create: (body: { name: string; config: Record<string, string> }) =>
      request("/connectors", { method: "POST", body: JSON.stringify(body) }),
    update: (name: string, config: Record<string, string>) =>
      request(`/connectors/${name}`, { method: "PUT", body: JSON.stringify(config) }),
    remove: (name: string) =>
      request(`/connectors/${name}`, { method: "DELETE" }),
    restart: (name: string) =>
      request(`/connectors/${name}/restart`, { method: "POST" }),
    pause: (name: string) =>
      request(`/connectors/${name}/pause`, { method: "POST" }),
    resume: (name: string) =>
      request(`/connectors/${name}/resume`, { method: "POST" }),
  },

  databases: {
    list: () => request<Array<{ name: string; type: string }>>("/databases"),
    tables: (db: string) =>
      request<Array<{ name: string; schema: string; rowCount: number | null }>>(
        `/databases/${db}/tables`
      ),
    columns: (db: string, table: string) =>
      request<Array<{ name: string; type: string; nullable: boolean; isPrimaryKey: boolean }>>(
        `/databases/${db}/tables/${table}/columns`
      ),
    preview: (db: string, table: string) =>
      request<{ columns: string[]; rows: Record<string, unknown>[] }>(
        `/databases/${db}/tables/${table}/preview`
      ),
  },

  templates: {
    list: () => request<Array<{ id: string; name: string; type: string }>>("/templates"),
    generate: (body: {
      templateId: string;
      database: string;
      tables: string[];
      options?: { snapshotMode?: string; topicPrefix?: string; connectorName?: string };
    }) =>
      request<{ name: string; config: Record<string, string> }>("/templates/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
};
```

- [ ] **Step 4: Create Layout components**

Create `apps/web/src/components/layout/Sidebar.tsx`:

```tsx
import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "◉" },
  { to: "/connectors", label: "Connectors", icon: "⇋" },
  { to: "/connectors/new", label: "New Connector", icon: "+" },
  { to: "/observability", label: "Observability", icon: "◎" },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-gray-100 min-h-screen p-4">
      <h1 className="text-xl font-bold mb-8 px-2">CDC Platform</h1>
      <nav className="space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <span className="text-lg">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

Create `apps/web/src/components/layout/Layout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create Dashboard components**

Create `apps/web/src/components/dashboard/StatusCard.tsx`:

```tsx
interface StatusCardProps {
  label: string;
  count: number;
  color: "green" | "yellow" | "red" | "gray";
}

const colorMap = {
  green: "bg-green-100 text-green-800 border-green-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  red: "bg-red-100 text-red-800 border-red-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
};

export function StatusCard({ label, count, color }: StatusCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{count}</p>
    </div>
  );
}
```

Create `apps/web/src/components/dashboard/ServiceHealth.tsx`:

```tsx
interface ServiceHealthProps {
  services: Record<string, { status: string; latencyMs: number }>;
}

export function ServiceHealth({ services }: ServiceHealthProps) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">Service Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(services).map(([name, info]) => (
          <div
            key={name}
            className="flex items-center gap-2 p-2 rounded border"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                info.status === "up" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {info.latencyMs}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create Dashboard page**

Create `apps/web/src/pages/Dashboard.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusCard } from "../components/dashboard/StatusCard";
import { ServiceHealth } from "../components/dashboard/ServiceHealth";

export function Dashboard() {
  const { data: connectors, isLoading: loadingConnectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ["health"],
    queryFn: api.health.getAll,
    refetchInterval: 10_000,
  });

  if (loadingConnectors || loadingHealth) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const running = connectors?.filter((c) => c.state === "RUNNING").length ?? 0;
  const paused = connectors?.filter((c) => c.state === "PAUSED").length ?? 0;
  const failed = connectors?.filter((c) => c.state === "FAILED").length ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard label="Running" count={running} color="green" />
        <StatusCard label="Paused" count={paused} color="yellow" />
        <StatusCard label="Failed" count={failed} color="red" />
      </div>

      {health && <ServiceHealth services={health.services} />}
    </div>
  );
}
```

- [ ] **Step 7: Wire up App with routing**

Replace `apps/web/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

Replace `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Verify React app runs locally**

Run:
```bash
cd apps/web && npm run dev
```

Open `http://localhost:5173` — should see sidebar + dashboard with connector status cards and service health (if BFF is running) or loading/error state.

- [ ] **Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat: add React app with layout, routing, and dashboard page"
```

---

### Task 9: React Connectors Pages (List + Detail)

**Files:**
- Create: `apps/web/src/pages/Connectors.tsx`
- Create: `apps/web/src/pages/ConnectorDetail.tsx`
- Create: `apps/web/src/components/connectors/ConnectorActions.tsx`
- Modify: `apps/web/src/App.tsx` — add routes

**Interfaces:**
- Consumes: `api.connectors` from Task 8, BFF connectors API from Task 5
- Produces: `/connectors` list page with inline actions, `/connectors/:name` detail page with config and tasks

- [ ] **Step 1: Create ConnectorActions component**

Create `apps/web/src/components/connectors/ConnectorActions.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ConnectorActionsProps {
  name: string;
  state: string;
}

export function ConnectorActions({ name, state }: ConnectorActionsProps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["connectors"] });

  const pause = useMutation({ mutationFn: () => api.connectors.pause(name), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => api.connectors.resume(name), onSuccess: invalidate });
  const restart = useMutation({ mutationFn: () => api.connectors.restart(name), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.connectors.remove(name), onSuccess: invalidate });

  return (
    <div className="flex gap-2">
      {state === "RUNNING" && (
        <button
          onClick={() => pause.mutate()}
          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
        >
          Pause
        </button>
      )}
      {state === "PAUSED" && (
        <button
          onClick={() => resume.mutate()}
          className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200"
        >
          Resume
        </button>
      )}
      <button
        onClick={() => restart.mutate()}
        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
      >
        Restart
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete connector "${name}"?`)) remove.mutate();
        }}
        className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
      >
        Delete
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create Connectors list page**

Create `apps/web/src/pages/Connectors.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConnectorActions } from "../components/connectors/ConnectorActions";

const stateColors: Record<string, string> = {
  RUNNING: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
  UNASSIGNED: "bg-gray-100 text-gray-800",
};

export function Connectors() {
  const { data: connectors, isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  if (isLoading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Connectors</h2>
        <Link
          to="/connectors/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-700"
        >
          New Connector
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium text-gray-500">Name</th>
              <th className="text-left p-3 font-medium text-gray-500">Type</th>
              <th className="text-left p-3 font-medium text-gray-500">Status</th>
              <th className="text-left p-3 font-medium text-gray-500">Tasks</th>
              <th className="text-left p-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {connectors?.map((c) => (
              <tr key={c.name} className="hover:bg-gray-50">
                <td className="p-3">
                  <Link
                    to={`/connectors/${c.name}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="p-3 text-gray-600">{c.type}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${stateColors[c.state] ?? stateColors.UNASSIGNED}`}>
                    {c.state}
                  </span>
                </td>
                <td className="p-3 text-gray-600">{c.tasks.length}</td>
                <td className="p-3">
                  <ConnectorActions name={c.name} state={c.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ConnectorDetail page**

Create `apps/web/src/pages/ConnectorDetail.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConnectorActions } from "../components/connectors/ConnectorActions";

export function ConnectorDetail() {
  const { name } = useParams<{ name: string }>();
  const { data: connector, isLoading } = useQuery({
    queryKey: ["connector", name],
    queryFn: () => api.connectors.get(name!),
    refetchInterval: 10_000,
  });

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (!connector) return <p className="text-red-500">Connector not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/connectors" className="text-gray-400 hover:text-gray-600">&larr;</Link>
        <h2 className="text-2xl font-bold text-gray-900">{connector.name}</h2>
        <ConnectorActions name={connector.name} state={connector.state} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Configuration</h3>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-96">
            {JSON.stringify(connector.config, null, 2)}
          </pre>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Tasks</h3>
          <div className="space-y-2">
            {connector.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                <span className={`w-2 h-2 rounded-full ${task.state === "RUNNING" ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-sm font-medium">Task {task.id}</span>
                <span className="text-xs text-gray-500">{task.state}</span>
                <span className="text-xs text-gray-400 ml-auto">{task.workerId}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add routes to App.tsx**

Modify `apps/web/src/App.tsx` — add imports:

```tsx
import { Connectors } from "./pages/Connectors";
import { ConnectorDetail } from "./pages/ConnectorDetail";
```

Add routes inside `<Route element={<Layout />}>`:

```tsx
<Route path="connectors" element={<Connectors />} />
<Route path="connectors/:name" element={<ConnectorDetail />} />
```

- [ ] **Step 5: Verify pages work**

Run dev server, navigate to:
- `http://localhost:5173/connectors` — should show table with connectors
- Click a connector name — should show detail page with config JSON and tasks

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat: add connectors list and detail pages"
```

---

### Task 10: React New Connector Wizard

**Files:**
- Create: `apps/web/src/pages/NewConnector.tsx`
- Create: `apps/web/src/components/wizard/StepSelectType.tsx`
- Create: `apps/web/src/components/wizard/StepSelectTables.tsx`
- Create: `apps/web/src/components/wizard/StepOptions.tsx`
- Create: `apps/web/src/components/wizard/StepPreview.tsx`
- Modify: `apps/web/src/App.tsx` — add route

**Interfaces:**
- Consumes: `api.databases`, `api.templates`, `api.connectors` from Task 8
- Produces: `/connectors/new` wizard page with 4 steps

- [ ] **Step 1: Create StepSelectType component**

Create `apps/web/src/components/wizard/StepSelectType.tsx`:

```tsx
interface StepSelectTypeProps {
  value: string;
  onChange: (templateId: string) => void;
}

const types = [
  { id: "debezium-postgres", label: "PostgreSQL Source", desc: "Capture changes from PostgreSQL via Debezium" },
  { id: "debezium-mysql", label: "MySQL Source", desc: "Capture changes from MySQL via Debezium" },
  { id: "s3-sink-minio", label: "MinIO Sink", desc: "Write Kafka topics to MinIO (S3)" },
];

export function StepSelectType({ value, onChange }: StepSelectTypeProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Select Connector Type</h3>
      <div className="grid gap-3">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`text-left p-4 rounded-lg border-2 transition ${
              value === t.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-medium">{t.label}</p>
            <p className="text-sm text-gray-500">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create StepSelectTables component**

Create `apps/web/src/components/wizard/StepSelectTables.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface StepSelectTablesProps {
  database: string;
  selected: string[];
  onChange: (tables: string[]) => void;
}

export function StepSelectTables({ database, selected, onChange }: StepSelectTablesProps) {
  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables", database],
    queryFn: () => api.databases.tables(database),
  });

  if (isLoading) return <p className="text-gray-500">Loading tables...</p>;

  const toggle = (fullName: string) => {
    onChange(
      selected.includes(fullName)
        ? selected.filter((t) => t !== fullName)
        : [...selected, fullName]
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Select Tables</h3>
      <p className="text-sm text-gray-500">Database: {database}</p>
      <div className="space-y-2">
        {tables?.map((t) => {
          const fullName = `${t.schema}.${t.name}`;
          return (
            <label
              key={fullName}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                selected.includes(fullName) ? "border-gray-900 bg-gray-50" : "border-gray-200"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(fullName)}
                onChange={() => toggle(fullName)}
                className="rounded"
              />
              <div>
                <p className="text-sm font-medium">{fullName}</p>
                <p className="text-xs text-gray-400">
                  {t.rowCount !== null ? `~${t.rowCount} rows` : ""}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create StepOptions component**

Create `apps/web/src/components/wizard/StepOptions.tsx`:

```tsx
interface StepOptionsProps {
  options: { snapshotMode: string; topicPrefix: string; connectorName: string };
  onChange: (options: StepOptionsProps["options"]) => void;
}

export function StepOptions({ options, onChange }: StepOptionsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Advanced Options</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Connector Name</label>
        <input
          type="text"
          value={options.connectorName}
          onChange={(e) => onChange({ ...options, connectorName: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
          placeholder="my-connector"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Topic Prefix</label>
        <input
          type="text"
          value={options.topicPrefix}
          onChange={(e) => onChange({ ...options, topicPrefix: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
          placeholder="pg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Snapshot Mode</label>
        <select
          value={options.snapshotMode}
          onChange={(e) => onChange({ ...options, snapshotMode: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
        >
          <option value="initial">initial — Snapshot + streaming</option>
          <option value="never">never — Streaming only</option>
          <option value="schema_only">schema_only — Schema snapshot, no data</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create StepPreview component**

Create `apps/web/src/components/wizard/StepPreview.tsx`:

```tsx
interface StepPreviewProps {
  config: { name: string; config: Record<string, string> } | null;
  isLoading: boolean;
}

export function StepPreview({ config, isLoading }: StepPreviewProps) {
  if (isLoading) return <p className="text-gray-500">Generating config...</p>;
  if (!config) return <p className="text-gray-500">No config generated</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Review Configuration</h3>
      <p className="text-sm text-gray-500">
        Connector: <span className="font-medium text-gray-900">{config.name}</span>
      </p>
      <pre className="text-xs bg-gray-50 p-4 rounded-lg border overflow-auto max-h-96">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 5: Create NewConnector wizard page**

Create `apps/web/src/pages/NewConnector.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { StepSelectType } from "../components/wizard/StepSelectType";
import { StepSelectTables } from "../components/wizard/StepSelectTables";
import { StepOptions } from "../components/wizard/StepOptions";
import { StepPreview } from "../components/wizard/StepPreview";

const templateToDb: Record<string, string> = {
  "debezium-postgres": "postgres",
  "debezium-mysql": "mysql",
  "s3-sink-minio": "postgres",
};

export function NewConnector() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [options, setOptions] = useState({
    snapshotMode: "initial",
    topicPrefix: "",
    connectorName: "",
  });

  const database = templateToDb[templateId] ?? "postgres";

  const { data: generatedConfig, isLoading: generating } = useQuery({
    queryKey: ["generate", templateId, selectedTables, options],
    queryFn: () =>
      api.templates.generate({
        templateId,
        database,
        tables: selectedTables,
        options,
      }),
    enabled: step === 3 && selectedTables.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (config: { name: string; config: Record<string, string> }) =>
      api.connectors.create(config),
    onSuccess: () => navigate("/connectors"),
  });

  const steps = [
    <StepSelectType key={0} value={templateId} onChange={setTemplateId} />,
    <StepSelectTables key={1} database={database} selected={selectedTables} onChange={setSelectedTables} />,
    <StepOptions key={2} options={options} onChange={setOptions} />,
    <StepPreview key={3} config={generatedConfig ?? null} isLoading={generating} />,
  ];

  const canNext =
    (step === 0 && templateId) ||
    (step === 1 && selectedTables.length > 0) ||
    step === 2 ||
    (step === 3 && generatedConfig);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">New Connector</h2>

      <div className="flex gap-2 mb-6">
        {["Type", "Tables", "Options", "Review"].map((label, i) => (
          <div
            key={label}
            className={`flex-1 h-1 rounded ${i <= step ? "bg-gray-900" : "bg-gray-200"}`}
          />
        ))}
      </div>

      <div className="bg-white rounded-lg border p-6">{steps[step]}</div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="px-4 py-2 text-sm border rounded-md disabled:opacity-30"
        >
          Back
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md disabled:opacity-30"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => generatedConfig && createMutation.mutate(generatedConfig)}
            disabled={!generatedConfig || createMutation.isPending}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md disabled:opacity-30"
          >
            {createMutation.isPending ? "Creating..." : "Create Connector"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add route to App.tsx**

Modify `apps/web/src/App.tsx` — add import:

```tsx
import { NewConnector } from "./pages/NewConnector";
```

Add route inside `<Route element={<Layout />}>` **before** the `connectors/:name` route:

```tsx
<Route path="connectors/new" element={<NewConnector />} />
```

- [ ] **Step 7: Verify wizard works**

Navigate to `http://localhost:5173/connectors/new`:
1. Select "PostgreSQL Source" → Next
2. Check tables → Next
3. Set options → Next
4. Review JSON → Create Connector
5. Should redirect to `/connectors` with new connector visible

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat: add new connector wizard with 4-step flow"
```

---

### Task 11: React Observability Page and Web Dockerfile

**Files:**
- Create: `apps/web/src/pages/Observability.tsx`
- Create: `apps/web/Dockerfile`
- Modify: `apps/web/src/App.tsx` — add route
- Modify: `docker/compose.app.yml` — add web service

**Interfaces:**
- Consumes: Grafana at `:3000` from Task 3, `api.health` from Task 8
- Produces: `/observability` page with embedded Grafana dashboards, web container at `:5173` on `cdc-network`

- [ ] **Step 1: Create Observability page**

Create `apps/web/src/pages/Observability.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ServiceHealth } from "../components/dashboard/ServiceHealth";

const dashboards = [
  { uid: "cdc-pipeline", title: "CDC Pipeline" },
  { uid: "infrastructure", title: "Infrastructure" },
  { uid: "logs-explorer", title: "Logs Explorer" },
];

const GRAFANA_URL = "http://localhost:3000";

export function Observability() {
  const [activeDashboard, setActiveDashboard] = useState(dashboards[0].uid);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health.getAll,
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Observability</h2>

      {health && <ServiceHealth services={health.services} />}

      <div className="bg-white rounded-lg border">
        <div className="flex border-b">
          {dashboards.map((d) => (
            <button
              key={d.uid}
              onClick={() => setActiveDashboard(d.uid)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeDashboard === d.uid
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>

        <iframe
          src={`${GRAFANA_URL}/d/${activeDashboard}?orgId=1&kiosk`}
          className="w-full border-0"
          style={{ height: "600px" }}
          title={activeDashboard}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

Modify `apps/web/src/App.tsx` — add import:

```tsx
import { Observability } from "./pages/Observability";
```

Add route inside `<Route element={<Layout />}>`:

```tsx
<Route path="observability" element={<Observability />} />
```

- [ ] **Step 3: Create web Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
```

Create `apps/web/nginx.conf`:

```nginx
server {
    listen 5173;

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://bff:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 4: Add web service to compose.app.yml**

Modify `docker/compose.app.yml` — add web service:

```yaml
  web:
    build:
      context: ../apps/web
      dockerfile: Dockerfile
    container_name: cdc-web
    ports:
      - "5173:5173"
    depends_on:
      bff:
        condition: service_healthy
    networks:
      - cdc-network
```

- [ ] **Step 5: Build and verify full stack**

```bash
cd docker
docker compose -f compose.app.yml build
docker compose -f compose.app.yml up -d
```

Verify:
- `http://localhost:5173` — Dashboard loads with connector counts and health status
- `http://localhost:5173/connectors` — Connector list
- `http://localhost:5173/connectors/new` — Wizard works end-to-end
- `http://localhost:5173/observability` — Grafana dashboards embedded

- [ ] **Step 6: Commit**

```bash
git add apps/web/ docker/compose.app.yml
git commit -m "feat: add observability page, web Dockerfile, and complete compose.app.yml"
```

---

### Task 12: End-to-End Verification and README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: documentation and verified working system

- [ ] **Step 1: Full stack smoke test**

Bring everything down and up fresh:

```bash
cd docker
docker compose -f compose.infra.yml -f compose.observability.yml -f compose.app.yml down -v
docker compose -f compose.infra.yml up -d
# Wait for healthy
docker compose -f compose.observability.yml up -d
docker compose -f compose.app.yml up -d
```

Register connectors:
```bash
./connectors/register-all.sh
```

Verify end-to-end:
```bash
# 1. Insert data to trigger CDC
docker exec cdc-postgres psql -U postgres -d cdc_source -c \
  "INSERT INTO customers (name, email) VALUES ('E2E Test', 'e2e@test.com');"

docker exec cdc-mysql mysql -uroot -proot -e \
  "INSERT INTO cdc_source.employees (name, department, salary) VALUES ('E2E Test', 'Engineering', 15000);"

# 2. Check Kafka topics have events
docker exec cdc-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic pg.public.customers \
  --from-beginning --max-messages 1 --timeout-ms 10000

# 3. Wait for flush and check MinIO
sleep 65
docker exec cdc-minio-init mc ls local/raw/ --recursive

# 4. Check BFF health
curl -s http://localhost:3001/api/health | jq

# 5. Check Grafana dashboards
curl -s -u admin:admin http://localhost:3000/api/search?type=dash-db | jq '.[].title'

# 6. Check web app
curl -sf http://localhost:5173 > /dev/null && echo "Web OK"
```

- [ ] **Step 2: Write README**

Create `README.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with architecture overview and quick start guide"
```
