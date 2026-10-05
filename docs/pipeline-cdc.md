# Pipeline CDC

## Visão Geral

O pipeline captura mudanças nos bancos de dados (PostgreSQL e MySQL) via Debezium, transmite pelo Redpanda e materializa em tabelas Apache Iceberg (Parquet) no MinIO, consultáveis via Trino e Superset.

## Fluxo de Dados

```
PostgreSQL (wal_level=logical)
  └─ postgres-source-iceberg (JSON flat, sem envelope)
       └─ Tópicos: pg-iceberg.public.*
            ├─ iceberg-sink-pg-customers → MinIO warehouse (Parquet)
            ├─ iceberg-sink-pg-orders    → MinIO warehouse (Parquet)
            └─ iceberg-sink-pg-products  → MinIO warehouse (Parquet)

MySQL (binlog ROW)
  └─ mysql-source (Avro + envelope Debezium)
       └─ Tópicos: mysql.cdc_source.*
            ├─ iceberg-sink-mysql-employees    → MinIO warehouse (Parquet)
            ├─ iceberg-sink-mysql-departments  → MinIO warehouse (Parquet)
            └─ iceberg-sink-mysql-audit_log    → MinIO warehouse (Parquet)

Iceberg (MinIO + JDBC Catalog)
  └─ Trino → Superset (SQL Lab)
```

Cada tabela tem seu próprio sink isolado — falha em uma não afeta as demais.

## Source Connectors

### PostgreSQL Source

- **Nome**: `postgres-source-iceberg`
- **Classe**: `io.debezium.connector.postgresql.PostgresConnector`
- **Prefixo de tópico**: `pg-iceberg`
- **Slot de replicação**: `debezium_iceberg_slot`
- **Converters**: `JsonConverter` (sem schema, flat)
- **Transforms**: `ExtractNewRecordState` (desembala o envelope Debezium no source)
- **Tombstones**: desabilitados (`tombstones.on.delete=false`)
- **Decimal handling**: `string` (evita encoding binário)
- **Função**: source dedicado para o Iceberg Sink, produz JSON flat sem envelope
- **Signal table**: `public.debezium_signal` (para snapshot incremental)
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

Os dados do CDC são materializados em tabelas Apache Iceberg no MinIO, usando o conector `io.tabular.iceberg.connect.IcebergSinkConnector`. Cada tabela tem seu próprio sink isolado — falha em uma não afeta as demais.

### Sinks individuais

| Sink | Tópico | Tabela Iceberg | Converter |
|---|---|---|---|
| `iceberg-sink-pg-customers` | `pg-iceberg.public.customers` | `iceberg_db.pg_customers` | JSON |
| `iceberg-sink-pg-orders` | `pg-iceberg.public.orders` | `iceberg_db.pg_orders` | JSON |
| `iceberg-sink-pg-products` | `pg-iceberg.public.products` | `iceberg_db.pg_products` | JSON |
| `iceberg-sink-mysql-employees` | `mysql.cdc_source.employees` | `iceberg_db.mysql_employees` | Avro |
| `iceberg-sink-mysql-departments` | `mysql.cdc_source.departments` | `iceberg_db.mysql_departments` | Avro |
| `iceberg-sink-mysql-audit_log` | `mysql.cdc_source.audit_log` | `iceberg_db.mysql_audit_log` | Avro |

Novos sinks são criados pela aba **Sinks** do painel web, que gera a config Iceberg automaticamente vinculada ao source selecionado.

### Configuração comum dos sinks

- **Auto-create**: habilitado (cria tabelas Iceberg automaticamente)
- **Schema evolution**: habilitado (adiciona colunas automaticamente)
- **Commit interval**: 60 segundos
- **Control topic**: individual por sink (`iceberg-control-pg-customers`, etc.)

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

## Snapshot Incremental

Para capturar dados que já existiam em uma tabela antes de adicioná-la ao CDC, o Debezium suporta snapshot incremental via signal table.

A tabela `public.debezium_signal` no `cdc_source` é monitorada pelo Debezium. Um INSERT nela com `type: "execute-snapshot"` trigga a captura dos dados existentes sem parar o streaming:

```sql
INSERT INTO debezium_signal (id, type, data)
VALUES (gen_random_uuid()::text, 'execute-snapshot', '{"data-collections": ["public.nova_tabela"]}');
```

No painel web, o botão ↻ na aba Sinks faz isso automaticamente via `POST /api/connectors/:name/snapshot`.

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
