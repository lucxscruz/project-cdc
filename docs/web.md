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
      Observability.tsx    # Dashboards Grafana embarcados
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
| `/observability` | Observability | Dashboards Grafana embarcados para observabilidade |

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
