# Frontend Web

Aplicação React para gerenciamento visual da plataforma CDC.

## Stack

- **Framework**: React 18.3
- **Build**: Vite 5.4
- **Linguagem**: TypeScript
- **Estilo**: CSS custom properties (tema escuro/claro, tipografia Geist)
- **Data fetching**: TanStack React Query 5.56
- **Roteamento**: React Router v6
- **Diretório**: `apps/web/`

## Estrutura

```
apps/web/
  src/
    main.tsx           # Entrypoint React
    App.tsx            # Router setup
    index.css          # Design system (CSS custom properties)
    pages/
      Dashboard.tsx    # KPIs dos connectors e health dos servicos
      Sources.tsx      # Lista e gerenciamento dos source connectors
      NewSource.tsx    # Wizard de criacao de source em 4 etapas
      ConnectorDetail.tsx  # Config JSON, tasks, status de qualquer connector
      Sinks.tsx        # Gestao dos sinks Iceberg por tabela
      Observability.tsx    # Dashboards Grafana embarcados
    components/
      layout/
        Layout.tsx     # Shell (sidebar + topbar + pagina)
        Sidebar.tsx    # Navegacao lateral com marca e links
        Topbar.tsx     # Breadcrumb, toggle de tema, indicador ao vivo
      dashboard/
        ServiceHealth.tsx  # Grid de saude dos servicos
        StatusCard.tsx     # KPI card com cor por estado
      connectors/
        ConnectorActions.tsx  # Botoes de acao (pause, resume, restart, delete)
      wizard/
        StepSelectTables.tsx   # Selecionar tabelas do banco
        StepOptions.tsx        # Configurar opcoes (nome, prefix, snapshot mode)
        StepPreview.tsx        # Preview e confirmar config JSON
    lib/
      api.ts           # Fetch wrapper para o BFF
```

## Rotas

| Path | Pagina | Descricao |
|------|--------|-----------|
| `/` | Dashboard | KPIs (total, running, paused, failed) e health dos servicos |
| `/sources` | Sources | Lista dos source connectors com acoes |
| `/sources/new` | NewSource | Wizard de criacao de source (PostgreSQL ou MySQL) |
| `/connectors/:name` | ConnectorDetail | Config JSON, lista de tasks, acoes de qualquer connector |
| `/sinks` | Sinks | Sinks Iceberg por tabela, com acoes individuais |
| `/observability` | Observability | Dashboards Grafana embarcados com tabs |

## Design System

O frontend usa CSS custom properties. O design system esta definido em `src/index.css`:

- **Tema escuro** como padrao (`data-theme="escuro"`)
- **Tema claro** via toggle no topbar (persistido em localStorage)
- **Tipografia**: Geist Sans + Geist Mono (via CDN)
- **Cores**: `--primary: #FE3E6D`, `--ok`, `--warn`, `--err`, `--info`
- **Componentes CSS**: `.shell`, `.sidebar`, `.topbar`, `.kpi`, `.painel`, `.densa`, `.badge`, `.acao`, `.acao-icone`, `.selector`, etc.

## Pagina Sources

Gerencia os source connectors Debezium:

- Lista apenas connectors do tipo `source`
- Botao **"Novo Source"** abre wizard com PostgreSQL e MySQL
- Wizard em 4 etapas: tipo → tabelas → opcoes → preview
- Acoes por source: pause, resume, restart, delete

## Pagina Sinks

Gerencia os sinks Iceberg individualmente por tabela:

- **Tabelas replicando**: nome do sink atrelado, badge de status, acoes por tabela
- **Botao ↻** (snapshot): trigga snapshot incremental via signal table do Debezium
- **Botao ⏸** (pausar): remove tabela da replicacao (estado salvo em localStorage)
- **Botao ✕** (remover): remove permanentemente
- **Botao ▶** (retomar): re-adiciona tabela pausada
- **Botao "+ Novo Sink"**: seleciona source → seleciona tabelas → cria sink Iceberg individual por tabela automaticamente
- **Detalhes da conexao**: toggle com host, porta, user, snapshot mode, slot, plugin, signal table

Cada sink Iceberg e isolado — falha em uma tabela nao afeta as demais.

## Comunicacao com o BFF

Todas as chamadas passam pelo wrapper `lib/api.ts` que faz `fetch` para `/api` (proxy em dev, nginx em producao).

O TanStack React Query gerencia cache e polling:
- **Health, Sources, Sinks**: polling a cada 10s
- **Connector detail**: polling a cada 10s

## Build e Deploy

```bash
# Desenvolvimento local (hot reload, requer Node.js 20+)
cd apps/web && npm run dev

# Docker (build automatico via docker-compose.yml, service "web")
# Serve via nginx na porta 5173
```

## Proxy em Desenvolvimento

O `vite.config.ts` configura proxy para o BFF:
- `/api/*` → `http://localhost:3001/api/*`
