# Infraestrutura

Toda a infraestrutura roda via Docker Compose no arquivo `docker/docker-compose.yml`.

## Rede

Todos os containers compartilham a rede bridge `cdc-network`. Os serviços se comunicam por nome de container.

## Serviços

### Databases

#### PostgreSQL 16

- **Container**: `cdc-postgres`
- **Imagem**: `postgres:16-alpine`
- **Porta**: `5432:5432`
- **Credenciais**: `postgres`/`postgres`
- **Database**: `cdc_source` (criado via `init.sql`)
- **Config**: `wal_level=logical`, `max_wal_senders=4`, `max_replication_slots=4`
- **Healthcheck**: `pg_isready -U postgres`
- **Tabelas seed**: `customers`, `orders`, `products`
- **Usuário Debezium**: `debezium`/`debezium` com permissão `REPLICATION`
- **Publication**: `debezium_publication` (ALL TABLES)

#### MySQL 8

- **Container**: `cdc-mysql`
- **Imagem**: `mysql:8`
- **Porta**: `3307:3306` (host 3307 para evitar conflito)
- **Credenciais**: `root`/`root`
- **Database**: `cdc_source`
- **Config**: `binlog-format=ROW`, `binlog-row-image=FULL`, `server-id=1`
- **Healthcheck**: `mysqladmin ping`
- **Tabelas seed**: `employees`, `departments`, `audit_log`
- **Usuário Debezium**: `debezium`/`debezium` com permissão `REPLICATION SLAVE/CLIENT`

### Streaming

#### Redpanda

- **Container**: `cdc-redpanda`
- **Imagem**: `redpandadata/redpanda:latest`
- **Portas**:
  - `9092` — Kafka broker (externo)
  - `29092` — Kafka broker (interno, entre containers)
  - `8081`/`18081` — Schema Registry
  - `28082` — Pandaproxy (HTTP Kafka)
  - `9644` — Admin API
- **Config**: `--smp=1 --memory=512M --overprovisioned`
- **Healthcheck**: `rpk cluster health`
- **Schema Registry**: embutido, compatibilidade BACKWARD

#### Redpanda Console

- **Container**: `cdc-redpanda-console`
- **Imagem**: `redpandadata/console:v2.7.2`
- **Porta**: `8080:8080`
- **Função**: UI para tópicos, mensagens, schemas
- **Depende de**: Redpanda (healthy)

### CDC

#### Kafka Connect

- **Container**: `cdc-kafka-connect`
- **Imagem**: custom (`docker/kafka-connect/Dockerfile`), baseada em `debezium/connect:2.5`
- **Porta**: `8083:8083`
- **Plugins adicionais**:
  - S3 Sink Connector (JARs em `s3-plugin/`)
  - `kafka-connect-avro-converter` (Maven)
  - Guava + failureaccess (dependências)
- **Converters**: `io.confluent.connect.avro.AvroConverter` (key e value)
- **Schema Registry URL**: `http://redpanda:8081`
- **Tópicos internos**: `connect_configs`, `connect_offsets`, `connect_statuses` (replication factor 1)
- **Healthcheck**: `curl -f http://localhost:8083/connectors`
- **Depende de**: Redpanda, Postgres, MySQL (todos healthy)

### Storage

#### MinIO

- **Container**: `cdc-minio`
- **Imagem**: `minio/minio`
- **Portas**: `19000:9000` (API), `19001:9001` (Console)
- **Credenciais**: `minioadmin`/`minioadmin`
- **Healthcheck**: `mc ready local`

#### MinIO Init

- **Container**: `cdc-minio-init`
- **Função**: cria o bucket `raw` na inicialização
- **Depende de**: MinIO (healthy)

### Observabilidade

#### Prometheus

- **Container**: `cdc-prometheus`
- **Porta**: `9090:9090`
- **Config**: `config/prometheus/prometheus.yml`
- **Retenção**: 7 dias

#### Loki

- **Container**: `cdc-loki`
- **Porta**: `3100:3100`
- **Config**: `config/loki/loki-config.yml`

#### Promtail

- **Container**: `cdc-promtail`
- **Função**: coleta logs dos containers via Docker socket
- **Config**: `config/promtail/promtail-config.yml`

#### Grafana

- **Container**: `cdc-grafana`
- **Porta**: `3000:3000`
- **Credenciais**: `admin`/`admin`
- **Datasources**: Prometheus + Loki (provisionados automaticamente)
- **Dashboards**: provisionados via `config/grafana/dashboards/`

## Volumes

Todos os dados persistentes usam Docker named volumes:

| Volume | Serviço |
|--------|---------|
| `postgres_data` | PostgreSQL |
| `mysql_data` | MySQL |
| `redpanda_data` | Redpanda |
| `minio_data` | MinIO |
| `prometheus_data` | Prometheus |
| `loki_data` | Loki |
| `grafana_data` | Grafana |

## Mapa de Portas

| Serviço | Host | Container |
|---------|------|-----------|
| PostgreSQL | 5432 | 5432 |
| MySQL | 3307 | 3306 |
| Redpanda Kafka | 9092 | 9092 |
| Schema Registry | 8081 | 18081 |
| Redpanda Console | 8080 | 8080 |
| Kafka Connect | 8083 | 8083 |
| MinIO API | 19000 | 9000 |
| MinIO Console | 19001 | 9001 |
| Prometheus | 9090 | 9090 |
| Loki | 3100 | 3100 |
| Grafana | 3000 | 3000 |
| BFF | 3001 | 3001 |
| Web | 5173 | 5173 |
