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
