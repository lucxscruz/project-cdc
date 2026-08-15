# CDC Platform — Design Spec

**Data:** 2026-08-15
**Objetivo:** Projeto de estudo/PDI para aprender Change Data Capture na prática
**Status:** Draft

---

## 1. Visao Geral

Plataforma de CDC containerizada que captura mudancas em bancos PostgreSQL e MySQL via Debezium, transmite eventos pelo Kafka, e sincroniza os dados no MinIO. Inclui painel de gestao web (React + Node BFF) e stack de observabilidade (Prometheus + Grafana + Loki).

### Stack Completa

| Camada | Tecnologias |
|---|---|
| Bancos fonte | PostgreSQL 16, MySQL 8 |
| CDC | Debezium 2.5 (pgoutput + binlog) |
| Streaming | Apache Kafka 3.7 (modo KRaft, sem Zookeeper) |
| Schema | Apicurio Registry 2 |
| Sink | Kafka Connect S3 Sink Connector → MinIO (formato JSON) |
| Aplicacao | React (Vite) + Node.js (Fastify) como BFF |
| Observabilidade | Prometheus, Grafana, Loki, Promtail |
| Infra | Docker Compose separado por camada |

### Principios

- **Clareza sobre robustez** — priorizar aprendizado e legibilidade
- **Arquitetura real** — componentes e padroes encontrados em producao
- **Incremental** — cada camada pode ser ligada independentemente

---

## 2. Estrutura do Projeto

```
pdi/
├── docker/
│   ├── compose.infra.yml          # Kafka, Postgres, MySQL, Debezium, Connect, MinIO, Apicurio
│   ├── compose.app.yml            # Node BFF + React
│   ├── compose.observability.yml  # Prometheus, Grafana, Loki, Promtail
│   └── config/
│       ├── kafka-connect/         # Worker properties, JMX exporter config
│       ├── prometheus/            # prometheus.yml (scrape targets)
│       ├── grafana/
│       │   ├── provisioning/
│       │   │   ├── datasources/   # Prometheus + Loki datasources
│       │   │   └── dashboards/    # Dashboard provisioning config
│       │   └── dashboards/        # JSON dashboard files
│       ├── loki/                  # loki-config.yml
│       ├── promtail/              # promtail-config.yml
│       ├── postgres/              # init.sql (wal_level=logical + tabelas exemplo)
│       └── mysql/                 # init.sql (binlog + tabelas exemplo)
├── apps/
│   ├── bff/                       # Node.js (Fastify)
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                       # React (Vite)
│       ├── src/
│       ├── Dockerfile
│       └── package.json
├── docs/
│   └── superpowers/
│       └── specs/
└── README.md
```

---

## 3. Infraestrutura Docker

### 3.1 Organizacao dos Compose Files

Tres compose files separados por camada, compartilhando uma rede Docker (`cdc-network`):

- **`compose.infra.yml`** — Pipeline CDC completa
- **`compose.app.yml`** — Painel de gestao (BFF + Web)
- **`compose.observability.yml`** — Metricas e logs

Todos os servicos entram na rede `cdc-network`. O `compose.infra.yml` cria a rede; os demais a referenciam como `external: true`.

**Ordem de inicializacao:** infra → observability → app

### 3.2 Servicos do compose.infra.yml

| Servico | Imagem | Porta | Configuracao |
|---|---|---|---|
| postgres | postgres:16 | 5432 | `wal_level=logical`, usuario de replicacao, init.sql com tabelas exemplo |
| mysql | mysql:8 | 3306 | `binlog_format=ROW`, `binlog_row_image=FULL`, usuario replicacao, init.sql |
| kafka | apache/kafka:3.7 | 9092 | Modo KRaft (KAFKA_PROCESS_ROLES=broker,controller), JMX Exporter na :9404 |
| schema-registry | apicurio/apicurio-registry:2 | 8080 | Storage in-memory (suficiente para estudo) |
| kafka-connect | debezium/connect:2.5 | 8083 | Debezium connectors built-in + S3 Sink Connector adicionado, JMX Exporter na :9405 |
| minio | minio/minio | 9000 (API) / 9001 (Console) | Bucket `raw` criado via init script |

### 3.3 Servicos do compose.observability.yml

| Servico | Imagem | Porta | Configuracao |
|---|---|---|---|
| prometheus | prom/prometheus | 9090 | Scrape: kafka:9404, kafka-connect:9405, bff:3001/metrics, minio:9000 |
| grafana | grafana/grafana | 3000 | Provisioning automatico de datasources (Prometheus, Loki) e 3 dashboards |
| loki | grafana/loki | 3100 | Config single-tenant, retencao 7 dias |
| promtail | grafana/promtail | — | Coleta via Docker socket, labels por container_name e compose_service |

### 3.4 Servicos do compose.app.yml

| Servico | Imagem | Porta | Configuracao |
|---|---|---|---|
| bff | Build local (apps/bff) | 3001 | Conecta em Kafka Connect, bancos, MinIO, Schema Registry, Prometheus |
| web | Build local (apps/web) | 5173 | Vite dev server, proxy para BFF |

---

## 4. Pipeline CDC — Fluxo de Dados

```
PostgreSQL ──→ Debezium Source Connector ──→ Kafka Topics ──→ S3 Sink Connector ──→ MinIO
MySQL      ──→ Debezium Source Connector ──→ Kafka Topics ──→ S3 Sink Connector ──→ MinIO
                                                 ↓
                                         Apicurio Schema Registry
```

### 4.1 Source Connectors (Debezium)

**PostgreSQL:**
- Usa plugin `pgoutput` (nativo do Postgres, sem extensao extra)
- `wal_level=logical` habilitado no init
- Um connector por banco, monitora tabelas selecionadas via `table.include.list`
- Topicos criados automaticamente: `{topic.prefix}.{schema}.{table}`

**MySQL:**
- Usa binlog nativo (`binlog_format=ROW`)
- Usuario com `REPLICATION SLAVE` e `REPLICATION CLIENT`
- Mesmo padrao de topicos

### 4.2 Schema Registry

- Debezium configurado com `key.converter` e `value.converter` apontando para Apicurio
- Converter: `io.apicurio.registry.utils.converter.ExtJsonConverter` (JSON com schema no registry)
- Schemas versionados automaticamente conforme DDL changes
- Modo de compatibilidade: **BACKWARD** (padrao da industria — consumer novo le dados antigos)
- Convencao: `id` (PK) nunca e removido das tabelas

### 4.3 Sink Connector (MinIO)

- S3 Sink Connector configurado com endpoint MinIO (`http://minio:9000`)
- Formato: JSON (JsonConverter)
- Bucket: `raw`
- Path: `{database}.{table}/{ds}/` (ex: `mydb_postgres.public.customers/2026-08-15/`)
- Particionamento diario por `ds` (YYYY-MM-DD) — facilita processamento posterior por tabela e data
- Flush: a cada 100 registros ou 60 segundos (o que vier primeiro)

### 4.4 Dados de Exemplo

**PostgreSQL (`init.sql`):**
- `customers` (id, name, email, created_at, updated_at)
- `orders` (id, customer_id, total, status, created_at)
- `products` (id, name, price, stock, category)

**MySQL (`init.sql`):**
- `employees` (id, name, department, salary, hired_at)
- `departments` (id, name, budget, location)
- `audit_log` (id, entity, action, payload, timestamp)

Tabelas diferentes por banco para facilitar a distincao durante o aprendizado.

---

## 5. Node BFF — API

**Stack:** Fastify, TypeScript

O BFF e o unico ponto de contato do React. Encapsula todas as APIs externas.

### 5.1 Modulo Connectors (`/api/connectors`)

| Metodo | Endpoint | Acao | API encapsulada |
|---|---|---|---|
| GET | `/` | Lista connectors com status | Kafka Connect `GET /connectors?expand=status` |
| GET | `/:name` | Detalhe (config + status + tasks) | Kafka Connect `GET /connectors/:name` + `/status` |
| POST | `/` | Cria connector | Kafka Connect `POST /connectors` |
| PUT | `/:name` | Atualiza config | Kafka Connect `PUT /connectors/:name/config` |
| DELETE | `/:name` | Remove connector | Kafka Connect `DELETE /connectors/:name` |
| POST | `/:name/restart` | Reinicia | Kafka Connect `POST /connectors/:name/restart` |
| POST | `/:name/pause` | Pausa | Kafka Connect `PUT /connectors/:name/pause` |
| POST | `/:name/resume` | Resume | Kafka Connect `PUT /connectors/:name/resume` |

### 5.2 Modulo Databases (`/api/databases`)

| Metodo | Endpoint | Acao |
|---|---|---|
| GET | `/` | Lista bancos configurados (pg, mysql) |
| GET | `/:db/tables` | Lista tabelas do banco (via query information_schema) |
| GET | `/:db/tables/:table/columns` | Lista colunas (nome, tipo, nullable, PK) |
| GET | `/:db/tables/:table/preview` | Preview de 50 registros |

O BFF mantém pools de conexao para cada banco configurado.

### 5.3 Modulo Templates (`/api/templates`)

| Metodo | Endpoint | Acao |
|---|---|---|
| GET | `/` | Lista templates disponiveis |
| POST | `/generate` | Gera JSON do connector a partir de template + parametros |

**Templates pre-definidos:**
- `debezium-postgres` — source connector PostgreSQL
- `debezium-mysql` — source connector MySQL
- `s3-sink-minio` — sink connector para MinIO

O endpoint `/generate` recebe: tipo do template, banco, tabelas selecionadas, e opcoes avancadas. Retorna o JSON pronto para criar o connector.

### 5.4 Modulo Health (`/api/health`)

| Metodo | Endpoint | Acao |
|---|---|---|
| GET | `/` | Status agregado de todos os servicos |
| GET | `/:service` | Health check individual |

**Servicos monitorados:** kafka, kafka-connect, postgres, mysql, minio, schema-registry

Cada check tenta conexao real (pg: `SELECT 1`, mysql: `SELECT 1`, kafka: metadata request, etc.).

### 5.5 Metricas (`/metrics`)

Endpoint Prometheus via `prom-client`:
- `bff_http_request_duration_seconds` — latencia por rota
- `bff_health_check_status` — gauge por servico (1=up, 0=down)
- `bff_connector_status` — gauge por connector (running, paused, failed)
- `bff_api_errors_total` — counter de erros por rota

---

## 6. Painel React

**Stack:** React 18, Vite, TypeScript, Shadcn/ui (componentes), TanStack Query (data fetching)

### 6.1 Telas

**Dashboard (home):**
- Cards com contagem de connectors por status (running/paused/failed)
- Cards de saude dos servicos (verde/amarelo/vermelho)
- Lista dos ultimos eventos relevantes

**Connectors (listagem):**
- Tabela com filtros (tipo: source/sink, status, banco de origem)
- Status atualizado via polling (10s)
- Acoes inline: pausar, resumir, reiniciar, deletar

**Connector (detalhe):**
- Config atual (JSON editavel)
- Status das tasks
- Metricas basicas (eventos processados, lag)

**Novo Connector (wizard 4 steps):**
1. Selecionar tipo (source PG, source MySQL, sink MinIO)
2. Selecionar tabelas e colunas (listagem vem do BFF `/api/databases`)
3. Configuracoes avancadas (snapshot mode, topic prefix, etc.)
4. Preview do JSON gerado → confirmar e criar

**Observabilidade:**
- Embed de dashboards Grafana via iframe
- Fallback: metricas simplificadas diretas do BFF

### 6.2 Comunicacao

- Todas as chamadas via BFF (`/api/*`)
- TanStack Query para cache, polling automatico, e estado de loading/error
- Polling de 10s para status dos connectors e health checks

---

## 7. Observabilidade

### 7.1 Metricas (Prometheus)

**Scrape targets:**

| Target | Endpoint | Metricas-chave |
|---|---|---|
| Kafka | `:9404/metrics` (JMX Exporter) | Messages in/out rate, under-replicated partitions, request latency |
| Kafka Connect | `:9405/metrics` (JMX Exporter) | Connector status, task count, offset commit latency, error rate |
| Node BFF | `:3001/metrics` | Request duration, health status, connector status gauges |
| MinIO | `:9000/minio/v2/metrics/cluster` | Object count, storage used, API requests |

O JMX Exporter roda como Java agent nos containers Kafka e Kafka Connect.

### 7.2 Logs (Loki + Promtail)

- Promtail coleta logs via Docker socket (`/var/run/docker.sock`)
- Labels automaticas: `container_name`, `compose_service`, `compose_project`
- Consulta no Grafana: `{compose_service="kafka-connect"} |= "ERROR"`
- Retencao: 7 dias

### 7.3 Dashboards Grafana (provisionados)

**1. CDC Pipeline:**
- Consumer lag por topico (gauge)
- Throughput de eventos por connector (rate)
- Status dos connectors (state timeline)
- Erros nos ultimos 30 minutos

**2. Infrastructure:**
- Status de cada servico (up/down)
- Metricas do Kafka broker (messages/s, partitions)
- MinIO storage usage

**3. Logs Explorer:**
- Filtro por servico e nivel (error, warn, info)
- Timeline de volume de logs
- Log lines com contexto

**Datasources provisionados:**
- Prometheus: `http://prometheus:9090`
- Loki: `http://loki:3100`

---

## 8. Rede e Comunicacao

Todos os containers compartilham a rede `cdc-network` (bridge driver).

```
┌─────────────────────────────────────────────────────────────────┐
│                        cdc-network                              │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ postgres │  │  mysql   │  │  kafka   │  │ kafka-connect │  │
│  │  :5432   │  │  :3306   │  │  :9092   │  │    :8083      │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  minio   │  │ apicurio │  │   bff    │  │   web    │       │
│  │:9000/9001│  │  :8080   │  │  :3001   │  │  :5173   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │prometheus│  │ grafana  │  │   loki   │  │ promtail │       │
│  │  :9090   │  │  :3000   │  │  :3100   │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

**Portas expostas ao host:**
- Essenciais: web (:5173), bff (:3001), grafana (:3000)
- Debug/admin: kafka (:9092), minio console (:9001), kafka-connect (:8083), apicurio (:8080), prometheus (:9090)

---

## 9. Decisoes Tecnicas

| Decisao | Justificativa |
|---|---|
| Kafka KRaft (sem Zookeeper) | Menos complexidade, menos containers, futuro do Kafka |
| Apicurio (nao Confluent) | Open-source sem restricoes de licenca |
| Fastify (nao Express) | Mais leve, schema validation nativo, melhor DX |
| Shadcn/ui (nao MUI/Ant) | Componentes copiados no projeto (sem dependencia), customizaveis |
| JSON no MinIO (nao Parquet) | Legivel, facil de inspecionar durante aprendizado |
| Promtail via Docker socket | Sem necessidade de configurar logging driver em cada container |
| JMX Exporter como Java agent | Padrao do ecossistema para expor metricas JVM ao Prometheus |
| Um unico Kafka Connect cluster | Source (Debezium) e Sink (S3) no mesmo runtime simplifica a infra |

---

## 10. Fora de Escopo

- Autenticacao/autorizacao no painel
- Alta disponibilidade (replicas, multi-broker)
- Transformacoes complexas nos eventos (SMT basico apenas)
- CI/CD e deploy em cloud
- Testes de carga/performance
