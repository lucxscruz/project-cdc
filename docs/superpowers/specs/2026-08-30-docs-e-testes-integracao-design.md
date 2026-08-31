# Documentação Técnica e Testes de Integração — Design

## Objetivo

Adicionar documentação técnica por componente e testes de integração que validem a pipeline CDC ponta-a-ponta e a API do BFF contra serviços reais rodando em Docker.

## Escopo

### Documentação Técnica (4 documentos)

| Documento | Conteúdo |
|-----------|----------|
| `docs/infra.md` | Docker Compose unificado, rede `cdc-network`, volumes, portas, healthchecks, configuração de cada serviço (Redpanda, Kafka Connect, MinIO, Postgres, MySQL, observabilidade) |
| `docs/pipeline-cdc.md` | Fluxo CDC completo: Debezium source connectors (Postgres pgoutput, MySQL binlog), serialização Avro, Schema Registry Redpanda, S3 Sink, particionamento no MinIO. Exemplos de payloads e diagrama de fluxo |
| `docs/bff.md` | Arquitetura do BFF Fastify: rotas (`/api/health`, `/api/connectors`, `/api/databases`, `/api/templates`), services, plugins, config. Como cada módulo se conecta aos serviços externos |
| `docs/web.md` | App React: páginas (Dashboard, Connectors, ConnectorDetail, NewConnector), componentes, roteamento, TanStack Query, wizard de criação de connectors |

### Testes de Integração

**Pré-requisito**: containers rodando via `docker compose up` no diretório `docker/`.

**Stack**: Vitest (já usado no projeto) + KafkaJS + pg + mysql2 + @aws-sdk/client-s3.

**Estrutura**:
```
tests/
  integration/
    setup.ts                        # Helpers: conexões, wait-for, cleanup
    vitest.integration.config.ts    # Config Vitest com timeout estendido
    pipeline/
      postgres-cdc.test.ts          # INSERT no PG → tópico Redpanda → objeto no MinIO
      mysql-cdc.test.ts             # INSERT no MySQL → tópico Redpanda → objeto no MinIO
    bff/
      health.test.ts                # GET /api/health contra serviços reais
      connectors.test.ts            # CRUD de connectors via BFF → Kafka Connect real
      databases.test.ts             # Introspection de bancos via BFF
      templates.test.ts             # Geração de templates via BFF
```

**Cenários de teste — Pipeline CDC**:

1. **Postgres CDC**: Inserir registro na tabela `customers` → consumir do tópico `pg.public.customers` via KafkaJS → verificar que o payload contém os dados inseridos
2. **Postgres CDC → MinIO**: Após flush do S3 Sink, verificar que existe objeto no bucket `raw` com prefixo `pg.public.customers/`
3. **MySQL CDC**: Inserir registro na tabela `employees` → consumir do tópico `mysql.cdc_source.employees` via KafkaJS → verificar payload
4. **Schema Registry**: Verificar que subjects foram registrados em `http://localhost:8081/subjects`

**Cenários de teste — BFF API**:

1. **Health**: `GET /api/health` retorna status dos 6 serviços e `status: "healthy"` quando todos estão up
2. **Connectors — list**: `GET /api/connectors` retorna os connectors registrados (postgres-source, mysql-source, etc.)
3. **Connectors — get**: `GET /api/connectors/:name` retorna detalhes com config e tasks
4. **Connectors — lifecycle**: pause → resume → verifica estado
5. **Databases — list**: `GET /api/databases` retorna postgres e mysql
6. **Databases — tables**: `GET /api/databases/postgres/tables` retorna customers, orders, products
7. **Databases — columns**: `GET /api/databases/postgres/tables/customers/columns` retorna colunas com tipos
8. **Databases — preview**: `GET /api/databases/postgres/tables/customers/preview` retorna dados seed
9. **Templates — list**: `GET /api/templates` retorna os 3 templates
10. **Templates — generate**: `POST /api/templates/generate` retorna config válida

**Configuração do Vitest para integração**:
- Timeout por teste: 30s (pipeline CDC pode demorar)
- Timeout de setup global: 60s (esperar serviços)
- Pool: `forks` (isolamento entre arquivos de teste)
- Config separada em `tests/vitest.integration.config.ts`

**Endereços (host, fora do Docker)**:
- Postgres: `localhost:5432`
- MySQL: `localhost:3307`
- Kafka (Redpanda): `localhost:9092`
- Kafka Connect: `localhost:8083`
- Schema Registry: `localhost:8081`
- MinIO: `localhost:19000`
- BFF: `localhost:3001`

**Script no root**: `package.json` com `"test:integration": "vitest run --config tests/vitest.integration.config.ts"`

## Decisões Técnicas

- **Vitest sobre Jest**: já é a ferramenta do projeto, sem overhead de migração
- **Containers pré-levantados**: simplicidade — não usa testcontainers
- **KafkaJS para consumir tópicos**: já é dependência do BFF, reusa
- **Cleanup por teste**: cada teste de pipeline insere com valor único (timestamp) para não colidir
- **Docs em português**: consistente com spec existente
- **Docs na raiz de `docs/`**: acesso direto, sem hierarquia desnecessária
