# Pipeline CDC

## Visão Geral

O pipeline captura mudanças nos bancos de dados (PostgreSQL e MySQL) via Debezium, transmite pelo Redpanda e materializa em tabelas Apache Iceberg (Parquet) no MinIO, consultáveis via Trino e Superset.

## Fluxo de Dados

```
PostgreSQL (wal_level=logical)
  ├─ postgres-source (Avro + envelope Debezium)
  │    └─ Tópicos: pg.public.customers, pg.public.orders, pg.public.products
  │
  └─ postgres-source-iceberg (JSON flat, sem envelope)
       └─ Tópicos: pg-iceberg.public.customers, pg-iceberg.public.orders, pg-iceberg.public.products
            └─ Iceberg Sink → MinIO bucket "warehouse" (Parquet)

MySQL (binlog ROW)
  └─ mysql-source (Avro + envelope Debezium)
       └─ Tópicos: mysql.cdc_source.employees, mysql.cdc_source.departments, mysql.cdc_source.audit_log
            └─ Iceberg Sink → MinIO bucket "warehouse" (Parquet)

Iceberg (MinIO + JDBC Catalog)
  └─ Trino → Superset (SQL Lab)
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

### PostgreSQL Source (Iceberg)

- **Nome**: `postgres-source-iceberg`
- **Classe**: `io.debezium.connector.postgresql.PostgresConnector`
- **Prefixo de tópico**: `pg-iceberg`
- **Slot de replicação**: `debezium_iceberg_slot`
- **Converters**: `JsonConverter` (sem schema, flat)
- **Transforms**: `ExtractNewRecordState` (desembala o envelope Debezium no source)
- **Tombstones**: desabilitados (`tombstones.on.delete=false`)
- **Decimal handling**: `string` (evita encoding binário)
- **Função**: source dedicado para o Iceberg Sink, produz JSON flat sem envelope
- **Config JSON**: `docker/connectors/register-postgres-source-iceberg.json`

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

## Iceberg Sink Connectors

Os dados do CDC são materializados em tabelas Apache Iceberg no MinIO, usando o conector `io.tabular.iceberg.connect.IcebergSinkConnector`.

### Iceberg Sink PostgreSQL

- **Nome**: `iceberg-sink-postgres`
- **Topics**: `pg-iceberg.public.customers`, `pg-iceberg.public.orders`, `pg-iceberg.public.products`
- **Tabelas Iceberg**: `iceberg_db.pg_customers`, `iceberg_db.pg_orders`, `iceberg_db.pg_products`
- **Converters**: `JsonConverter` (lê dos tópicos JSON flat)
- **Auto-create**: habilitado (cria tabelas Iceberg automaticamente)
- **Schema evolution**: habilitado (adiciona colunas automaticamente)
- **Commit interval**: 60 segundos
- **Control topic**: `iceberg-pg-control`
- **Config JSON**: `docker/connectors/register-iceberg-sink-postgres.json`

### Iceberg Sink MySQL

- **Nome**: `iceberg-sink-mysql`
- **Topics**: `mysql.cdc_source.employees`, `mysql.cdc_source.departments`, `mysql.cdc_source.audit_log`
- **Tabelas Iceberg**: `iceberg_db.mysql_employees`, `iceberg_db.mysql_departments`, `iceberg_db.mysql_audit_log`
- **Converters**: `AvroConverter` + Schema Registry
- **Config JSON**: `docker/connectors/register-iceberg-sink-mysql.json`

### JDBC Catalog

O metadata das tabelas Iceberg (schemas, snapshots, manifest files) é armazenado no PostgreSQL, database `iceberg_catalog`. O Trino e o Kafka Connect compartilham o mesmo catalog.

### Estrutura no MinIO

```
warehouse/
  iceberg_db/
    pg_customers/
      data/
        00001-....parquet         ← dados columnar
        00001-....parquet
      metadata/
        00000-....metadata.json   ← snapshot inicial
        00001-....metadata.json   ← snapshot após commit
    pg_orders/
    pg_products/
```

### Schema Evolution

Com `iceberg.tables.evolve-schema-enabled=true`:

1. O Debezium detecta um `ALTER TABLE` e produz eventos com o novo schema
2. O Iceberg Sink detecta o campo novo e atualiza o metadata da tabela
3. Arquivos Parquet antigos continuam intactos (campo novo = `null`)
4. O Trino faz merge na leitura — todas as versões coexistem

### Operações no Debezium

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
