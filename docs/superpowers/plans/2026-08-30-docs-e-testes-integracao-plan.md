# Documentação Técnica e Testes de Integração — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar documentação técnica por componente (4 docs) e testes de integração para pipeline CDC e API do BFF.

**Architecture:** Documentação em Markdown na raiz de `docs/`. Testes de integração em `tests/integration/` na raiz do projeto, usando Vitest com config separada. Os testes assumem containers rodando via `docker compose up`.

**Tech Stack:** Vitest, KafkaJS, pg, mysql2, @aws-sdk/client-s3, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-30-docs-e-testes-integracao-design.md`

## Global Constraints

- Vitest ^2.1.0 (já no projeto)
- Node.js 20
- TypeScript ^5.6.0
- Testes de integração requerem containers rodando (`cd docker && docker compose up -d`)
- Docs em português
- Endereços host: PG `localhost:5432`, MySQL `localhost:3307`, Kafka `localhost:9092`, Kafka Connect `localhost:8083`, Schema Registry `localhost:8081`, MinIO `localhost:19000`, BFF `localhost:3001`

---

### Task 1: Documentação — Infraestrutura (`docs/infra.md`)

**Files:**
- Create: `docs/infra.md`

**Interfaces:**
- Consumes: nada
- Produces: documento referenciado pelos demais docs

- [ ] **Step 1: Criar `docs/infra.md`**

Conteúdo do documento:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/infra.md
git commit -m "docs: adicionar documentação técnica da infraestrutura"
```

---

### Task 2: Documentação — Pipeline CDC (`docs/pipeline-cdc.md`)

**Files:**
- Create: `docs/pipeline-cdc.md`

**Interfaces:**
- Consumes: nada
- Produces: documento standalone

- [ ] **Step 1: Criar `docs/pipeline-cdc.md`**

Conteúdo do documento:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/pipeline-cdc.md
git commit -m "docs: adicionar documentação técnica do pipeline CDC"
```

---

### Task 3: Documentação — BFF (`docs/bff.md`)

**Files:**
- Create: `docs/bff.md`

**Interfaces:**
- Consumes: nada
- Produces: documento standalone

- [ ] **Step 1: Criar `docs/bff.md`**

Conteúdo do documento:

```markdown
# BFF (Backend for Frontend)

Backend Node.js com Fastify que serve de proxy entre o frontend React e os serviços de infraestrutura.

## Stack

- **Runtime**: Node.js 20
- **Framework**: Fastify 5.0
- **Linguagem**: TypeScript 5.6
- **Testes unitários**: Vitest 2.1
- **Diretório**: `apps/bff/`

## Arquitetura

```
apps/bff/
  src/
    server.ts          # Entrypoint — cria app, registra plugins e rotas
    config.ts          # Variáveis de ambiente com defaults
    routes/
      health.ts        # GET /api/health, GET /api/health/:service
      connectors.ts    # CRUD + lifecycle de connectors
      databases.ts     # Introspection de bancos
      templates.ts     # Listagem e geração de configs
    services/
      health-checker.ts      # Verifica saúde de 6 serviços
      kafka-connect-client.ts # Proxy REST para Kafka Connect API
      database-client.ts      # Queries de introspection PG/MySQL
      template-engine.ts      # Geração de configs de connectors
    plugins/
      metrics.ts       # Métricas Prometheus via prom-client
```

## Configuração (`config.ts`)

Todas as variáveis têm defaults para rodar dentro do Docker Compose:

| Variável | Default | Descrição |
|----------|---------|-----------|
| `PORT` | `3001` | Porta do servidor |
| `HOST` | `0.0.0.0` | Endereço de bind |
| `PG_HOST` | `postgres` | Host PostgreSQL |
| `PG_PORT` | `5432` | Porta PostgreSQL |
| `PG_USER` | `postgres` | Usuário PostgreSQL |
| `PG_PASSWORD` | `postgres` | Senha PostgreSQL |
| `PG_DATABASE` | `cdc_source` | Database PostgreSQL |
| `MYSQL_HOST` | `mysql` | Host MySQL |
| `MYSQL_PORT` | `3306` | Porta MySQL |
| `MYSQL_USER` | `root` | Usuário MySQL |
| `MYSQL_PASSWORD` | `root` | Senha MySQL |
| `MYSQL_DATABASE` | `cdc_source` | Database MySQL |
| `KAFKA_CONNECT_URL` | `http://kafka-connect:8083` | URL Kafka Connect |
| `KAFKA_BROKERS` | `redpanda:29092` | Brokers Kafka |
| `MINIO_ENDPOINT` | `http://minio:9000` | Endpoint MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | Access key MinIO |
| `MINIO_SECRET_KEY` | `minioadmin` | Secret key MinIO |
| `SCHEMA_REGISTRY_URL` | `http://redpanda:8081` | URL Schema Registry |

## Rotas

### Health (`/api/health`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status agregado de todos os serviços. Retorna 200 se todos "up", 503 se algum "down" |
| GET | `/api/health/:service` | Status individual. Serviços válidos: `postgres`, `mysql`, `kafka`, `kafka-connect`, `minio`, `schema-registry` |

**Resposta GET /api/health:**
```json
{
  "status": "healthy",
  "services": {
    "postgres": { "status": "up", "latencyMs": 5 },
    "mysql": { "status": "up", "latencyMs": 3 },
    "kafka": { "status": "up", "latencyMs": 10 },
    "kafka-connect": { "status": "up", "latencyMs": 8 },
    "minio": { "status": "up", "latencyMs": 4 },
    "schema-registry": { "status": "up", "latencyMs": 6 }
  }
}
```

### Connectors (`/api/connectors`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/connectors` | Lista todos os connectors com status e tasks |
| GET | `/api/connectors/:name` | Detalhes de um connector (config + tasks) |
| POST | `/api/connectors` | Cria connector. Body: `{ name, config }` |
| PUT | `/api/connectors/:name` | Atualiza config. Body: `Record<string, string>` |
| DELETE | `/api/connectors/:name` | Remove connector |
| POST | `/api/connectors/:name/restart` | Reinicia connector |
| POST | `/api/connectors/:name/pause` | Pausa connector |
| POST | `/api/connectors/:name/resume` | Resume connector |

### Databases (`/api/databases`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/databases` | Lista bancos disponíveis (postgres, mysql) |
| GET | `/api/databases/:db/tables` | Lista tabelas do banco |
| GET | `/api/databases/:db/tables/:table/columns` | Lista colunas com tipo, nullable, isPrimaryKey |
| GET | `/api/databases/:db/tables/:table/preview` | Retorna até 50 registros da tabela |

### Templates (`/api/templates`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/templates` | Lista templates disponíveis (debezium-postgres, debezium-mysql, s3-sink-minio) |
| POST | `/api/templates/generate` | Gera config de connector a partir de template |

**Body POST /api/templates/generate:**
```json
{
  "templateId": "debezium-postgres",
  "database": "postgres",
  "tables": ["public.customers"],
  "options": {
    "snapshotMode": "initial",
    "topicPrefix": "pg",
    "connectorName": "my-pg-source"
  }
}
```

## Services

### HealthChecker

Verifica saúde dos 6 serviços com conexão real:
- **postgres/mysql**: abre conexão e executa `SELECT 1`
- **kafka/kafka-connect**: HTTP para Kafka Connect REST API
- **minio**: HTTP para `/minio/health/live`
- **schema-registry**: HTTP para `/subjects`

### KafkaConnectClient

Proxy para a REST API do Kafka Connect (`http://kafka-connect:8083`). Todas as operações são pass-through com transformação de resposta.

### DatabaseClient

Abre conexões diretas com PostgreSQL (via `pg`) e MySQL (via `mysql2`) para queries de introspection no `information_schema`.

### TemplateEngine

Gera configs de connectors a partir de 3 templates hardcoded. Cada template preenche os campos necessários (host, port, user, tabelas, etc.) com base nos parâmetros recebidos.

## Build e Deploy

```bash
# Desenvolvimento (hot reload)
cd apps/bff && npm run dev

# Build
cd apps/bff && npm run build

# Produção
cd apps/bff && npm start

# Testes unitários
cd apps/bff && npm test

# Docker
# Build automático via docker-compose.yml (service "bff")
```

## Métricas

O plugin `metrics.ts` expõe métricas Prometheus no endpoint `GET /metrics`:
- Gauges de saúde dos serviços
- Gauges de estado dos connectors
```

- [ ] **Step 2: Commit**

```bash
git add docs/bff.md
git commit -m "docs: adicionar documentação técnica do BFF"
```

---

### Task 4: Documentação — Web (`docs/web.md`)

**Files:**
- Create: `docs/web.md`

**Interfaces:**
- Consumes: nada
- Produces: documento standalone

- [ ] **Step 1: Criar `docs/web.md`**

Conteúdo do documento:

```markdown
# Frontend Web

Aplicação React para gerenciamento visual da plataforma CDC.

## Stack

- **Framework**: React 18.3
- **Build**: Vite 5.4
- **Linguagem**: TypeScript
- **Estilo**: TailwindCSS 4.0
- **Data fetching**: TanStack React Query 5.56
- **Roteamento**: React Router v6
- **Diretório**: `apps/web/`

## Estrutura

```
apps/web/
  src/
    main.tsx           # Entrypoint React
    App.tsx            # Router setup
    pages/
      Dashboard.tsx    # Visão geral — status dos serviços e connectors
      Connectors.tsx   # Lista de connectors com filtros e ações
      ConnectorDetail.tsx  # Detalhes, config, tasks de um connector
      NewConnector.tsx     # Wizard de criação em 4 etapas
    components/
      layout/
        Layout.tsx     # Wrapper com Sidebar
        Sidebar.tsx    # Navegação lateral
      dashboard/
        ServiceHealth.tsx  # Card de saúde dos serviços
        StatusCard.tsx     # Card genérico de status
      connectors/
        ConnectorActions.tsx  # Botões de ação (pause, resume, restart, delete)
      wizard/
        StepSelectType.tsx     # Etapa 1: selecionar tipo (source/sink)
        StepSelectTables.tsx   # Etapa 2: selecionar tabelas
        StepOptions.tsx        # Etapa 3: configurar opções
        StepPreview.tsx        # Etapa 4: preview e confirmar
    lib/
      api.ts           # Fetch wrapper para o BFF
```

## Rotas

| Path | Página | Descrição |
|------|--------|-----------|
| `/` | Dashboard | Status dos serviços, connectors ativos, métricas gerais |
| `/connectors` | Connectors | Lista paginada com filtro por tipo e estado |
| `/connectors/:name` | ConnectorDetail | Config JSON, status de tasks, ações |
| `/connectors/new` | NewConnector | Wizard de criação de connector |

## Comunicação com o BFF

Todas as chamadas passam pelo wrapper `lib/api.ts` que faz `fetch` para `http://localhost:3001/api` (dev) ou `/api` (produção via proxy).

O TanStack React Query gerencia cache e polling:
- **Health**: polling a cada 10s
- **Connectors list**: polling a cada 5s
- **Connector detail**: polling a cada 3s

## Wizard de Criação de Connector

Fluxo em 4 etapas, navegáveis com botões "Voltar" e "Próximo":

1. **StepSelectType**: escolhe entre source (Debezium PG, Debezium MySQL) ou sink (S3 MinIO)
2. **StepSelectTables**: busca tabelas do banco selecionado via `/api/databases/:db/tables` e permite seleção múltipla
3. **StepOptions**: configura snapshot mode, topic prefix, nome do connector
4. **StepPreview**: mostra o JSON final gerado via `/api/templates/generate`. Botão "Criar" faz POST em `/api/connectors`

## Build e Deploy

```bash
# Desenvolvimento (hot reload na porta 5173)
cd apps/web && npm run dev

# Build produção
cd apps/web && npm run build

# Docker
# Build automático via docker-compose.yml (service "web")
# Serve via nginx na porta 5173
```

## Proxy em Desenvolvimento

O `vite.config.ts` configura proxy para o BFF:
- `/api/*` → `http://localhost:3001/api/*`

Isso permite que o frontend rode standalone (`npm run dev`) sem precisar de Docker.
```

- [ ] **Step 2: Commit**

```bash
git add docs/web.md
git commit -m "docs: adicionar documentação técnica do frontend web"
```

---

### Task 5: Setup de Testes de Integração

**Files:**
- Create: `package.json` (raiz do projeto — novo)
- Create: `tests/integration/vitest.integration.config.ts`
- Create: `tests/integration/setup.ts`
- Modify: `.gitignore` — adicionar `node_modules/` se não houver na raiz

**Interfaces:**
- Consumes: nada
- Produces: `waitForServices()`, `getTestPgClient()`, `getTestMysqlConnection()`, `getTestKafka()`, `getTestMinioClient()`, `getTestBffUrl()`, `cleanup()` — usados por todos os testes

- [ ] **Step 1: Criar `package.json` na raiz**

```json
{
  "name": "cdc-platform",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:integration": "vitest run --config tests/integration/vitest.integration.config.ts"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.0",
    "pg": "^8.13.0",
    "mysql2": "^3.11.0",
    "kafkajs": "^2.2.4",
    "@aws-sdk/client-s3": "^3.700.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0"
  }
}
```

- [ ] **Step 2: Criar `tests/integration/vitest.integration.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 3: Criar `tests/integration/setup.ts`**

```typescript
import pg from "pg";
import mysql from "mysql2/promise";
import { Kafka } from "kafkajs";
import {
  S3Client,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

// Endereços no host (fora do Docker)
export const PG_CONFIG = {
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "cdc_source",
};

export const MYSQL_CONFIG = {
  host: "localhost",
  port: 3307,
  user: "root",
  password: "root",
  database: "cdc_source",
};

export const KAFKA_BROKERS = ["localhost:9092"];
export const KAFKA_CONNECT_URL = "http://localhost:8083";
export const SCHEMA_REGISTRY_URL = "http://localhost:8081";
export const MINIO_ENDPOINT = "http://localhost:19000";
export const BFF_URL = "http://localhost:3001";

export function getTestPgClient(): pg.Client {
  return new pg.Client(PG_CONFIG);
}

export async function getTestMysqlConnection(): Promise<mysql.Connection> {
  return mysql.createConnection(MYSQL_CONFIG);
}

export function getTestKafka(): Kafka {
  return new Kafka({
    clientId: "integration-tests",
    brokers: KAFKA_BROKERS,
  });
}

export function getTestMinioClient(): S3Client {
  return new S3Client({
    endpoint: MINIO_ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
    forcePathStyle: true,
  });
}

export function getTestBffUrl(): string {
  return BFF_URL;
}

/**
 * Espera até que um serviço responda, com retry.
 */
export async function waitForService(
  name: string,
  checkFn: () => Promise<void>,
  maxRetries = 30,
  intervalMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await checkFn();
      return;
    } catch {
      if (i === maxRetries - 1) {
        throw new Error(
          `Serviço ${name} não ficou pronto após ${maxRetries * intervalMs / 1000}s`,
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

/**
 * Espera que todos os serviços necessários estejam prontos.
 */
export async function waitForServices(): Promise<void> {
  await waitForService("kafka-connect", async () => {
    const res = await fetch(`${KAFKA_CONNECT_URL}/connectors`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  await waitForService("bff", async () => {
    const res = await fetch(`${BFF_URL}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  await waitForService("schema-registry", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

/**
 * Lista objetos no bucket MinIO com prefixo.
 */
export async function listMinioObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<ListObjectsV2CommandOutput> {
  return client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
  );
}
```

- [ ] **Step 4: Instalar dependências**

```bash
cd /Users/cruz/Desktop/project-cdc && npm install
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/integration/vitest.integration.config.ts tests/integration/setup.ts
git commit -m "feat: adicionar setup de testes de integração com Vitest"
```

---

### Task 6: Testes de Integração — Pipeline CDC PostgreSQL

**Files:**
- Create: `tests/integration/pipeline/postgres-cdc.test.ts`

**Interfaces:**
- Consumes: `getTestPgClient()`, `getTestKafka()`, `getTestMinioClient()`, `waitForServices()`, `listMinioObjects()` de `setup.ts`
- Produces: nada (teste final)

- [ ] **Step 1: Criar `tests/integration/pipeline/postgres-cdc.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestPgClient,
  getTestKafka,
  getTestMinioClient,
  waitForServices,
  listMinioObjects,
  SCHEMA_REGISTRY_URL,
} from "../setup.js";

describe("Pipeline CDC — PostgreSQL", () => {
  beforeAll(async () => {
    await waitForServices();
  });

  it("deve capturar INSERT no Postgres e entregar no tópico Redpanda", async () => {
    const uniqueName = `test-user-${Date.now()}`;
    const pgClient = getTestPgClient();
    await pgClient.connect();

    try {
      await pgClient.query(
        "INSERT INTO customers (name, email) VALUES ($1, $2)",
        [uniqueName, `${uniqueName}@test.com`],
      );
    } finally {
      await pgClient.end();
    }

    // Consumir do tópico pg.public.customers
    const kafka = getTestKafka();
    const consumer = kafka.consumer({ groupId: `test-pg-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({
      topic: "pg.public.customers",
      fromBeginning: true,
    });

    const found = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 20_000);

      consumer.run({
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (value && value.includes(uniqueName)) {
            clearTimeout(timeout);
            resolve(true);
          }
        },
      });
    });

    await consumer.disconnect();
    expect(found).toBe(true);
  });

  it("deve ter schemas registrados no Schema Registry para tópicos PG", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    const subjects: string[] = await res.json();

    expect(subjects).toContain("pg.public.customers-value");
    expect(subjects).toContain("pg.public.customers-key");
  });

  it("deve ter objetos no MinIO para tópicos PG", async () => {
    const minio = getTestMinioClient();
    const result = await listMinioObjects(minio, "raw", "pg.public.customers/");

    expect(result.Contents).toBeDefined();
    expect(result.Contents!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Executar teste para verificar que passa**

```bash
cd /Users/cruz/Desktop/project-cdc && npm run test:integration -- tests/integration/pipeline/postgres-cdc.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/pipeline/postgres-cdc.test.ts
git commit -m "test: adicionar testes de integração do pipeline CDC PostgreSQL"
```

---

### Task 7: Testes de Integração — Pipeline CDC MySQL

**Files:**
- Create: `tests/integration/pipeline/mysql-cdc.test.ts`

**Interfaces:**
- Consumes: `getTestMysqlConnection()`, `getTestKafka()`, `waitForServices()`, `SCHEMA_REGISTRY_URL` de `setup.ts`
- Produces: nada (teste final)

- [ ] **Step 1: Criar `tests/integration/pipeline/mysql-cdc.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import {
  getTestMysqlConnection,
  getTestKafka,
  waitForServices,
  SCHEMA_REGISTRY_URL,
} from "../setup.js";

describe("Pipeline CDC — MySQL", () => {
  beforeAll(async () => {
    await waitForServices();
  });

  it("deve capturar INSERT no MySQL e entregar no tópico Redpanda", async () => {
    const uniqueName = `test-emp-${Date.now()}`;
    const conn = await getTestMysqlConnection();

    try {
      await conn.execute(
        "INSERT INTO employees (name, department, salary) VALUES (?, ?, ?)",
        [uniqueName, "Engineering", 15000.0],
      );
    } finally {
      await conn.end();
    }

    // Consumir do tópico mysql.cdc_source.employees
    const kafka = getTestKafka();
    const consumer = kafka.consumer({ groupId: `test-mysql-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({
      topic: "mysql.cdc_source.employees",
      fromBeginning: true,
    });

    const found = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 20_000);

      consumer.run({
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (value && value.includes(uniqueName)) {
            clearTimeout(timeout);
            resolve(true);
          }
        },
      });
    });

    await consumer.disconnect();
    expect(found).toBe(true);
  });

  it("deve ter schemas registrados no Schema Registry para tópicos MySQL", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    const subjects: string[] = await res.json();

    expect(subjects).toContain("mysql.cdc_source.employees-value");
    expect(subjects).toContain("mysql.cdc_source.employees-key");
  });
});
```

- [ ] **Step 2: Executar teste**

```bash
cd /Users/cruz/Desktop/project-cdc && npm run test:integration -- tests/integration/pipeline/mysql-cdc.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/pipeline/mysql-cdc.test.ts
git commit -m "test: adicionar testes de integração do pipeline CDC MySQL"
```

---

### Task 8: Testes de Integração — BFF Health

**Files:**
- Create: `tests/integration/bff/health.test.ts`

**Interfaces:**
- Consumes: `getTestBffUrl()`, `waitForServices()` de `setup.ts`
- Produces: nada (teste final)

- [ ] **Step 1: Criar `tests/integration/bff/health.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Health", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/health deve retornar status dos serviços", async () => {
    const res = await fetch(`${bffUrl}/api/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.services).toHaveProperty("postgres");
    expect(body.services).toHaveProperty("mysql");
    expect(body.services).toHaveProperty("kafka");
    expect(body.services).toHaveProperty("kafka-connect");
    expect(body.services).toHaveProperty("minio");
    expect(body.services).toHaveProperty("schema-registry");

    for (const service of Object.values(body.services) as any[]) {
      expect(service.status).toBe("up");
      expect(service.latencyMs).toBeTypeOf("number");
    }
  });

  it("GET /api/health/postgres deve retornar status individual", async () => {
    const res = await fetch(`${bffUrl}/api/health/postgres`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("up");
    expect(body.latencyMs).toBeTypeOf("number");
  });

  it("GET /api/health/unknown deve retornar 404", async () => {
    const res = await fetch(`${bffUrl}/api/health/unknown`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Executar teste**

```bash
cd /Users/cruz/Desktop/project-cdc && npm run test:integration -- tests/integration/bff/health.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/bff/health.test.ts
git commit -m "test: adicionar testes de integração do BFF health"
```

---

### Task 9: Testes de Integração — BFF Connectors

**Files:**
- Create: `tests/integration/bff/connectors.test.ts`

**Interfaces:**
- Consumes: `getTestBffUrl()`, `waitForServices()` de `setup.ts`
- Produces: nada (teste final)

- [ ] **Step 1: Criar `tests/integration/bff/connectors.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Connectors", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/connectors deve listar connectors registrados", async () => {
    const res = await fetch(`${bffUrl}/api/connectors`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const names = body.map((c: any) => c.name);
    expect(names).toContain("postgres-source");
  });

  it("GET /api/connectors/:name deve retornar detalhes", async () => {
    const res = await fetch(`${bffUrl}/api/connectors/postgres-source`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("postgres-source");
    expect(body.config).toBeDefined();
    expect(body.tasks).toBeDefined();
    expect(body.state).toBeDefined();
  });

  it("deve suportar pause e resume de connector", async () => {
    // Pause
    const pauseRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source/pause`,
      { method: "POST" },
    );
    expect(pauseRes.status).toBe(204);

    // Esperar propagação
    await new Promise((r) => setTimeout(r, 2000));

    // Verificar estado PAUSED
    const statusRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source`,
    );
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("PAUSED");

    // Resume
    const resumeRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source/resume`,
      { method: "POST" },
    );
    expect(resumeRes.status).toBe(204);

    // Esperar propagação
    await new Promise((r) => setTimeout(r, 2000));

    // Verificar estado RUNNING
    const finalRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source`,
    );
    const finalBody = await finalRes.json();
    expect(finalBody.state).toBe("RUNNING");
  });
});
```

- [ ] **Step 2: Executar teste**

```bash
cd /Users/cruz/Desktop/project-cdc && npm run test:integration -- tests/integration/bff/connectors.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/bff/connectors.test.ts
git commit -m "test: adicionar testes de integração do BFF connectors"
```

---

### Task 10: Testes de Integração — BFF Databases e Templates

**Files:**
- Create: `tests/integration/bff/databases.test.ts`
- Create: `tests/integration/bff/templates.test.ts`

**Interfaces:**
- Consumes: `getTestBffUrl()`, `waitForServices()` de `setup.ts`
- Produces: nada (teste final)

- [ ] **Step 1: Criar `tests/integration/bff/databases.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Databases", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/databases deve listar postgres e mysql", async () => {
    const res = await fetch(`${bffUrl}/api/databases`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);

    const names = body.map((db: any) => db.name);
    expect(names).toContain("postgres");
    expect(names).toContain("mysql");
  });

  it("GET /api/databases/postgres/tables deve listar tabelas seed", async () => {
    const res = await fetch(`${bffUrl}/api/databases/postgres/tables`);
    const body = await res.json();

    expect(res.status).toBe(200);
    const names = body.map((t: any) => t.name);
    expect(names).toContain("customers");
    expect(names).toContain("orders");
    expect(names).toContain("products");
  });

  it("GET /api/databases/postgres/tables/customers/columns deve retornar colunas", async () => {
    const res = await fetch(
      `${bffUrl}/api/databases/postgres/tables/customers/columns`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const names = body.map((c: any) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("name");
    expect(names).toContain("email");

    const idCol = body.find((c: any) => c.name === "id");
    expect(idCol.isPrimaryKey).toBe(true);
  });

  it("GET /api/databases/postgres/tables/customers/preview deve retornar dados", async () => {
    const res = await fetch(
      `${bffUrl}/api/databases/postgres/tables/customers/preview`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.columns).toContain("name");
    expect(body.columns).toContain("email");
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("GET /api/databases/mysql/tables deve listar tabelas seed", async () => {
    const res = await fetch(`${bffUrl}/api/databases/mysql/tables`);
    const body = await res.json();

    expect(res.status).toBe(200);
    const names = body.map((t: any) => t.name);
    expect(names).toContain("employees");
    expect(names).toContain("departments");
    expect(names).toContain("audit_log");
  });
});
```

- [ ] **Step 2: Criar `tests/integration/bff/templates.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Templates", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/templates deve listar os 3 templates", async () => {
    const res = await fetch(`${bffUrl}/api/templates`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(3);

    const ids = body.map((t: any) => t.id);
    expect(ids).toContain("debezium-postgres");
    expect(ids).toContain("debezium-mysql");
    expect(ids).toContain("s3-sink-minio");
  });

  it("POST /api/templates/generate deve gerar config de connector PG", async () => {
    const res = await fetch(`${bffUrl}/api/templates/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "debezium-postgres",
        database: "postgres",
        tables: ["public.customers"],
        options: { connectorName: "test-pg-gen" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("test-pg-gen");
    expect(body.config["connector.class"]).toBe(
      "io.debezium.connector.postgresql.PostgresConnector",
    );
    expect(body.config["table.include.list"]).toBe("public.customers");
  });

  it("POST /api/templates/generate deve gerar config de S3 sink", async () => {
    const res = await fetch(`${bffUrl}/api/templates/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "s3-sink-minio",
        database: "postgres",
        tables: ["public.customers"],
        options: { connectorName: "test-s3-gen", topicPrefix: "pg" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("test-s3-gen");
    expect(body.config["connector.class"]).toBe(
      "io.confluent.connect.s3.S3SinkConnector",
    );
    expect(body.config["s3.bucket.name"]).toBe("raw");
  });
});
```

- [ ] **Step 3: Executar testes**

```bash
cd /Users/cruz/Desktop/project-cdc && npm run test:integration -- tests/integration/bff/databases.test.ts tests/integration/bff/templates.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/bff/databases.test.ts tests/integration/bff/templates.test.ts
git commit -m "test: adicionar testes de integração do BFF databases e templates"
```

---
