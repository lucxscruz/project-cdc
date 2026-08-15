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
| Streaming | Redpanda (broker Kafka-compativel + Schema Registry integrado) |
| Sink | Kafka Connect S3 Sink Connector → MinIO (formato JSON) |
| Aplicacao | React (Vite) + Node.js (Fastify) como BFF |
| Observabilidade | Prometheus, Grafana, Loki, Promtail |
| Infra | Docker Compose unificado (`docker/docker-compose.yml`) |

### Principios

- **Clareza sobre robustez** — priorizar aprendizado e legibilidade
- **Arquitetura real** — componentes e padroes encontrados em producao
- **Incremental** — cada camada pode ser ligada independentemente

---

## 2. Estrutura do Projeto

```
pdi/
├── docker/
│   ├── docker-compose.yml         # Compose unificado (arquivo principal)
│   ├── compose.infra.yml          # Legado — nao e o arquivo principal
│   ├── compose.app.yml            # Legado — nao e o arquivo principal
│   ├── compose.observability.yml  # Legado — nao e o arquivo principal
│   ├── kafka-connect/
│   │   └── Dockerfile             # Imagem customizada com S3 Sink Connector pre-instalado
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
├── connectors/                    # JSONs de configuracao dos connectors
├── docs/
│   └── superpowers/
│       └── specs/
├── start.sh                       # Sobe tudo via docker-compose.yml unificado
├── stop.sh                        # Para tudo
└── README.md
```

---

## 3. Infraestrutura Docker

### 3.1 Organizacao dos Compose Files

Um unico compose file unificado (`docker/docker-compose.yml`) contem todos os servicos, compartilhando a rede Docker `cdc-network`.

Os arquivos legados (`compose.infra.yml`, `compose.app.yml`, `compose.observability.yml`) ainda existem no repositorio mas nao sao o ponto de entrada principal.

Os scripts `start.sh` e `stop.sh` na raiz do projeto operam sobre o compose unificado.

### 3.2 Servicos do docker-compose.yml (infraestrutura CDC)

| Servico | Imagem | Porta (host:container) | Configuracao |
|---|---|---|---|
| postgres | postgres:16 | 5432:5432 | `wal_level=logical`, usuario de replicacao, init.sql com tabelas exemplo |
| mysql | mysql:8 | 3307:3306 | `binlog_format=ROW`, `binlog_row_image=FULL`, usuario replicacao, init.sql |
| redpanda | redpandadata/redpanda | 9092:9092, 9644:9644, 18081:8081, 18082:8082 | Substitui Kafka broker + Apicurio Schema Registry em um unico container |
| redpanda-console | redpandadata/console | 8080:8080 | UI web para topicos, consumer groups, schemas |
| kafka-connect | Build local (docker/kafka-connect/Dockerfile) | 8083:8083 | Imagem customizada sobre debezium/connect:2.5 com S3 Sink Connector pre-instalado via JARs copiados |
| minio | minio/minio | 19000:9000 (API) / 19001:9001 (Console) | Bucket `raw` criado via init script |

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
PostgreSQL ──→ Debezium Source Connector ──→ Redpanda Topics ──→ S3 Sink Connector ──→ MinIO
MySQL      ──→ Debezium Source Connector ──→ Redpanda Topics ──→ S3 Sink Connector ──→ MinIO
```

Redpanda e Kafka-compativel: Kafka Connect e os connectors Debezium se comunicam com Redpanda usando o protocolo Kafka padrao, sem alteracoes de configuracao no lado dos connectors.

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

### 4.2 Converters

- Converter utilizado: `org.apache.kafka.connect.json.JsonConverter` (JsonConverter padrao do Kafka Connect)
- O `io.apicurio.registry.utils.converter.ExtJsonConverter` foi descartado: a imagem `debezium/connect:2.5` nao inclui os JARs do Apicurio converter, e Redpanda ja fornece Schema Registry integrado se necessario no futuro
- Mensagens trafegam em JSON simples, sem schema embedado
- Convencao: `id` (PK) nunca e removido das tabelas

### 4.3 Sink Connector (MinIO)

- S3 Sink Connector instalado via Dockerfile customizado (`docker/kafka-connect/Dockerfile`) que copia os JARs do plugin pre-baixados para o container
- Endpoint MinIO configurado como `http://minio:9000` (dentro da rede Docker; a porta do host e 19000)
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

**Servicos monitorados:** redpanda, kafka-connect, postgres, mysql, minio

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
| Redpanda | `:9644/metrics` | Messages in/out rate, partitions, request latency |
| Kafka Connect | `:9405/metrics` (JMX Exporter) | Connector status, task count, offset commit latency, error rate |
| Node BFF | `:3001/metrics` | Request duration, health status, connector status gauges |
| MinIO | `:9000/minio/v2/metrics/cluster` (interno) | Object count, storage used, API requests |

O JMX Exporter roda como Java agent no container Kafka Connect. Redpanda expoe metricas nativamente no endpoint `/metrics`.

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
┌──────────────────────────────────────────────────────────────────────────┐
│                              cdc-network                                 │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────┐        │
│  │ postgres │  │  mysql   │  │   redpanda   │  │ kafka-connect │        │
│  │  :5432   │  │  :3306   │  │  :9092/:9644 │  │    :8083      │        │
│  └──────────┘  └──────────┘  └──────────────┘  └───────────────┘        │
│                                                                          │
│  ┌──────────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ redpanda-console │  │  minio   │  │   bff    │  │   web    │         │
│  │      :8080       │  │:9000/9001│  │  :3001   │  │  :5173   │         │
│  └──────────────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │prometheus│  │ grafana  │  │   loki   │  │ promtail │                 │
│  │  :9090   │  │  :3000   │  │  :3100   │  │          │                 │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Portas expostas ao host** (algumas diferem para evitar conflitos locais):

| Servico | Porta host | Porta container |
|---|---|---|
| Web Panel | 5173 | 5173 |
| BFF | 3001 | 3001 |
| Grafana | 3000 | 3000 |
| Redpanda (Kafka) | 9092 | 9092 |
| Redpanda Console | 8080 | 8080 |
| Kafka Connect | 8083 | 8083 |
| Prometheus | 9090 | 9090 |
| MySQL | 3307 | 3306 |
| MinIO API | 19000 | 9000 |
| MinIO Console | 19001 | 9001 |

---

## 9. Decisoes Tecnicas

| Decisao | Justificativa |
|---|---|
| Redpanda (nao Kafka + Zookeeper/KRaft) | Broker + Schema Registry em um container so; mais simples para estudo, Kafka-compativel |
| JsonConverter (nao Apicurio ExtJsonConverter) | `debezium/connect:2.5` nao inclui os JARs do Apicurio converter; JsonConverter funciona out-of-the-box |
| S3 Sink via Dockerfile customizado | Plugin nao incluido na imagem base; JARs copiados no build resolve sem dependencia de internet em runtime |
| Compose unificado (nao separado por camada) | Simplifica o fluxo de start/stop para o contexto de aprendizado; scripts start.sh/stop.sh encapsulam o comando |
| Portas host distintas para MySQL/MinIO | Evita conflitos com servicos locais comuns (:3306, :9000/:9001) sem alterar configuracao interna dos containers |
| Fastify (nao Express) | Mais leve, schema validation nativo, melhor DX |
| Shadcn/ui (nao MUI/Ant) | Componentes copiados no projeto (sem dependencia), customizaveis |
| JSON no MinIO (nao Parquet) | Legivel, facil de inspecionar durante aprendizado |
| Promtail via Docker socket | Sem necessidade de configurar logging driver em cada container |
| Um unico Kafka Connect cluster | Source (Debezium) e Sink (S3) no mesmo runtime simplifica a infra |

---

## 10. Fora de Escopo

- Autenticacao/autorizacao no painel
- Alta disponibilidade (replicas, multi-broker)
- Transformacoes complexas nos eventos (SMT basico apenas)
- CI/CD e deploy em cloud
- Testes de carga/performance
