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
      Connectors.tsx   # Lista de connectors com acoes
      ConnectorDetail.tsx  # Config JSON, tasks, status
      NewConnector.tsx     # Wizard de criacao em 4 etapas
      Replication.tsx      # Gestao de tabelas replicadas por source
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
        StepSelectType.tsx     # Etapa 1: selecionar tipo (source/sink)
        StepSelectTables.tsx   # Etapa 2: selecionar tabelas
        StepOptions.tsx        # Etapa 3: configurar opcoes
        StepPreview.tsx        # Etapa 4: preview e confirmar
    lib/
      api.ts           # Fetch wrapper para o BFF
```

## Rotas

| Path | Pagina | Descricao |
|------|--------|-----------|
| `/` | Dashboard | KPIs (total, running, paused, failed) e health dos servicos |
| `/connectors` | Connectors | Tabela densa com badges de status e acoes |
| `/connectors/:name` | ConnectorDetail | Config JSON, lista de tasks, acoes |
| `/connectors/new` | NewConnector | Wizard de criacao de connector em 4 passos |
| `/replication` | Replication | Tabelas replicadas por source, com acoes por tabela |
| `/observability` | Observability | Dashboards Grafana embarcados com tabs |

## Design System

O frontend usa CSS custom properties ao inves de Tailwind. O design system esta definido em `src/index.css`:

- **Tema escuro** como padrao (`data-theme="escuro"`)
- **Tema claro** via toggle no topbar (persistido em localStorage)
- **Tipografia**: Geist Sans + Geist Mono (via CDN)
- **Cores**: `--primary: #FE3E6D`, `--ok`, `--warn`, `--err`, `--info`
- **Componentes CSS**: `.shell`, `.sidebar`, `.topbar`, `.kpi`, `.painel`, `.densa`, `.badge`, `.acao`, `.selector`, etc.

## Pagina Replication

Gerencia a replicacao de tabelas individualmente por source connector:

- **Tabelas replicando**: badge verde, botoes de pausar (⏸) e remover (✕)
- **Tabelas pausadas**: badge amarelo, botoes de retomar (▶) e remover (✕)
- **Tabelas disponiveis**: botao de adicionar (+)
- **Adicionar tabela**: botao no header abre fluxo para selecionar source e tabelas
- **Detalhes da conexao**: toggle com host, porta, user, snapshot mode, slot, plugin
- **Estado de pausa**: persistido em localStorage para diferenciar de "nunca adicionada"

## Comunicacao com o BFF

Todas as chamadas passam pelo wrapper `lib/api.ts` que faz `fetch` para `/api` (proxy em dev, nginx em producao).

O TanStack React Query gerencia cache e polling:
- **Health e Connectors**: polling a cada 10s
- **Connector detail**: polling a cada 10s
- **Replication**: polling a cada 10s

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
