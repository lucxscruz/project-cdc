# Pipeline CDC

## Visão Geral

O pipeline captura mudanças nos bancos de dados (PostgreSQL e MySQL) via Debezium, serializa em Avro, transmite pelo Redpanda e armazena no MinIO em formato JSON.

## Fluxo de Dados

```
PostgreSQL (wal_level=logical)
  └─ Debezium PostgresConnector (pgoutput)
       └─ Tópicos: pg.public.customers, pg.public.orders, pg.public.products
            └─ Avro serializado (AvroConverter + Schema Registry)

MySQL (binlog ROW)
  └─ Debezium MySqlConnector (binlog)
       └─ Tópicos: mysql.cdc_source.employees, mysql.cdc_source.departments, mysql.cdc_source.audit_log
            └─ Avro serializado (AvroConverter + Schema Registry)

Tópicos Redpanda
  └─ S3 Sink Connector
       └─ MinIO bucket "raw" (JSON, particionado por tópico/data)
```

## Source Connectors

### PostgreSQL Source

- **Classe**: `io.debezium.connector.postgresql.PostgresConnector`
- **Plugin de replicação**: `pgoutput` (nativo do PG 10+)
- **Publication**: `debezium_publication` (ALL TABLES)
- **Slot de replicação**: `debezium_slot`
- **Prefixo de tópico**: `pg`
- **Schema incluído**: `public`
- **Tabelas**: `public.customers`, `public.orders`, `public.products`
- **Snapshot mode**: `initial` (faz snapshot na primeira execução, depois só CDC)
- **Config JSON**: `docker/connectors/register-postgres-source.json`

### MySQL Source

- **Classe**: `io.debezium.connector.mysql.MySqlConnector`
- **Mecanismo**: binlog (ROW format)
- **Server ID**: `1001`
- **Prefixo de tópico**: `mysql`
- **Database**: `cdc_source`
- **Tabelas**: `cdc_source.employees`, `cdc_source.departments`, `cdc_source.audit_log`
- **Schema history**: tópico `schema-changes.mysql` no Redpanda
- **Config JSON**: `docker/connectors/register-mysql-source.json`

## Serialização Avro

Todos os connectors usam `io.confluent.connect.avro.AvroConverter` para key e value:

```json
"key.converter": "io.confluent.connect.avro.AvroConverter",
"key.converter.schema.registry.url": "http://redpanda:8081",
"value.converter": "io.confluent.connect.avro.AvroConverter",
"value.converter.schema.registry.url": "http://redpanda:8081"
```

Schemas são auto-registrados no Schema Registry do Redpanda. Compatibilidade: **BACKWARD**.

### Subjects no Schema Registry

Para cada tópico, dois subjects são criados:
- `{topic}-key` — schema da chave (geralmente a PK)
- `{topic}-value` — schema do envelope Debezium (before, after, source, op, ts_ms)

Exemplo: `pg.public.customers-key`, `pg.public.customers-value`

## S3 Sink Connector

### PostgreSQL Sink

- **Classe**: `io.confluent.connect.s3.S3SinkConnector`
- **Topics regex**: `pg\\..*` (todos os tópicos com prefixo `pg`)
- **Bucket**: `raw`
- **Formato**: JSON (`io.confluent.connect.s3.format.json.JsonFormat`)
- **Particionamento**: `DailyPartitioner` — `{topic}/YYYY-MM-dd/`
- **Flush**: a cada 100 registros ou 60 segundos
- **Storage**: S3 compatível (MinIO em `http://minio:9000`)
- **Config JSON**: `docker/connectors/register-s3-sink-postgres.json`

### Estrutura no MinIO

```
raw/
  pg.public.customers/
    2026-08-30/
      pg.public.customers+0+0000000000.json
      pg.public.customers+0+0000000100.json
  pg.public.orders/
    2026-08-30/
      ...
```

O nome do arquivo segue o padrão: `{topic}+{partition}+{offset}.json`

### Payload de exemplo (JSON no MinIO)

```json
{
  "before": null,
  "after": {
    "id": 1,
    "name": "Alice Silva",
    "email": "alice@example.com",
    "created_at": 1693526400000000,
    "updated_at": 1693526400000000
  },
  "source": {
    "version": "2.5.0.Final",
    "connector": "postgresql",
    "name": "pg",
    "ts_ms": 1693526400000,
    "db": "cdc_source",
    "schema": "public",
    "table": "customers"
  },
  "op": "r",
  "ts_ms": 1693526400123
}
```

- `op: "r"` = read (snapshot inicial)
- `op: "c"` = create (INSERT)
- `op: "u"` = update (UPDATE)
- `op: "d"` = delete (DELETE)

## Registro de Connectors

O script `docker/connectors/register-all.sh` registra todos os connectors via REST API do Kafka Connect:

```bash
# Registrar todos
./docker/connectors/register-all.sh

# Registrar individualmente
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @docker/connectors/register-postgres-source.json
```

## Monitoramento

- **Kafka Connect REST API**: `http://localhost:8083/connectors?expand=status`
- **Redpanda Console**: `http://localhost:8080` — tópicos, mensagens, schemas
- **Prometheus**: métricas JMX do Kafka Connect exportadas
- **BFF API**: `http://localhost:3001/api/connectors` (proxy para Kafka Connect)
