# CDC Platform UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CDC Platform web UI to match the Cora Swarm dashboard visual language — dark theme, CSS custom properties, sidebar navigation, KPI cards, dense tables, and badges.

**Architecture:** Replace Tailwind utility classes with a CSS-variable-based design system extracted from Cora Swarm's `console.html`. The component structure stays the same (React + React Router + React Query). Each component gets restyled using the new CSS classes. Tailwind is removed from the build pipeline.

**Tech Stack:** React 18, React Router 6, React Query 5, Vite 5, TypeScript, CSS custom properties (no Tailwind)

**Spec:** Design approved in-chat conversation on 2026-10-02. Reference: Cora Swarm `src/platform/dashboard/console.html`.

## Global Constraints

- Keep all existing functionality intact — no behavioral changes
- Use CSS custom properties for all colors, spacing, typography
- Dark theme as default, light theme via `data-theme="claro"` toggle
- Font: Geist Sans (sans) + Geist Mono (mono) — loaded via CDN
- Primary color: `#FE3E6D` (Cora pink)
- No Tailwind — pure CSS with the Cora Swarm class vocabulary
- No new npm dependencies (remove `tailwindcss` and `@tailwindcss/vite`)

## Review Focus

1. **Theme toggle persistence** — toggling theme should save to localStorage and survive page reload
2. **Responsive sidebar collapse** — on narrow screens the sidebar should not overlap content
3. **Empty states** — connector list and dashboard should render gracefully when API returns empty arrays
4. **Long connector names** — names should truncate with ellipsis, not break the table layout
5. **Iframe Grafana embed** — the Observability page iframe must still work with the dark background

---

### Task 1: Design System CSS + HTML Shell

**Files:**
- Modify: `apps/web/src/index.css` (replace Tailwind import with full design system)
- Modify: `apps/web/index.html` (add Geist font, lang="pt-BR", dark theme default)
- Modify: `apps/web/package.json` (remove tailwindcss, @tailwindcss/vite)
- Modify: `apps/web/vite.config.ts` (remove tailwindcss plugin)

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties and utility classes available globally for all subsequent tasks

- [ ] **Step 1: Update `index.html`**

Replace the contents of `apps/web/index.html`:

```html
<!doctype html>
<html lang="pt-BR" data-theme="escuro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CDC Platform</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-mono/style.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Write the design system CSS in `index.css`**

Replace `apps/web/src/index.css` with the full design system. This includes all CSS custom properties, the shell grid, sidebar, topbar, KPI cards, panels, dense tables, badges, wizard, form inputs, and empty/error states. Extract all reusable classes from Cora Swarm's `console.html` adapted for CDC context.

```css
*, *::before, *::after { box-sizing: border-box; }

:root {
  color-scheme: dark;
  --bg: #09090B; --surface: #101013; --panel: #141417; --panel-2: #18181C;
  --line: #232327; --line-2: #2E2E34; --hair: #1A1A1E;
  --text: #FAFAFA; --muted: #A1A1AA; --quiet: #71717A;
  --primary: #FE3E6D; --primary-fg: #FFFFFF; --primary-soft: rgba(254,62,109,.14);
  --ok: #34D399; --ok-soft: rgba(16,185,129,.14);
  --warn: #FBBF24; --warn-soft: rgba(245,158,11,.14);
  --err: #FB7185; --err-soft: rgba(244,63,94,.14);
  --info: #38BDF8;
  --track: #27272A; --nav-active: #1C1C20;
  --shadow: 0 1px 2px rgba(0,0,0,.4);
  --sans: "Geist", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --railw: 218px; --pagepad: 22px; --cardpad: 14px;
}

:root[data-theme="claro"] {
  color-scheme: light;
  --bg: #F4F4F5; --surface: #FFFFFF; --panel: #FFFFFF; --panel-2: #FAFAFA;
  --line: #E4E4E7; --line-2: #D4D4D8; --hair: #F1F1F3;
  --text: #0A0A0A; --muted: #52525B; --quiet: #A1A1AA;
  --primary-soft: rgba(254,62,109,.10);
  --ok: #047857; --ok-soft: #D1FAE5;
  --warn: #B45309; --warn-soft: #FEF3C7;
  --err: #BE123C; --err-soft: #FFE4E6;
  --info: #0284C7;
  --track: #E4E4E7; --nav-active: #FFFFFF;
  --shadow: 0 1px 2px rgba(9,9,11,.05);
}

html, body { height: 100%; margin: 0; }
body {
  background: var(--bg); color: var(--text);
  font-family: var(--sans); font-size: 13px; line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
a { color: inherit; }

/* Shell */
.shell { display: grid; grid-template-columns: var(--railw) 1fr; min-height: 100vh; }

/* Sidebar */
.sidebar {
  background: var(--surface); border-right: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 2px; padding: 16px 12px;
  position: sticky; top: 0; height: 100vh;
}
.brand { display: flex; align-items: center; gap: 9px; padding: 2px 6px 16px; }
.brand-name { display: flex; flex-direction: column; line-height: 1.15; }
.brand-name b { font-size: 13px; font-weight: 600; }
.brand-name small { font-size: 10.5px; color: var(--quiet); letter-spacing: .04em; }
.nav-label {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--quiet); padding: 8px 8px 6px;
}
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: flex; align-items: center; gap: 9px; padding: 7px 9px; border-radius: 8px;
  color: var(--muted); text-decoration: none; font-size: 12.5px; font-weight: 500;
}
.nav a:hover { background: var(--panel-2); color: var(--text); }
.nav a.active { background: var(--nav-active); color: var(--text); }
.sidebar-rodape {
  margin-top: auto; display: flex; flex-direction: column; gap: 3px;
  padding: 10px 8px 2px; border-top: 1px solid var(--line);
}
.sidebar-rodape b { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 500; }
.sidebar-rodape small { font-size: 11px; color: var(--quiet); font-family: var(--mono); }

/* Main */
.main { display: flex; flex-direction: column; min-width: 0; }

/* Topbar */
.topbar {
  position: sticky; top: 0; z-index: 20; height: 57px; flex: none;
  display: flex; align-items: center; gap: 12px; padding: 0 24px;
  background: var(--bg); border-bottom: 1px solid var(--line);
}
.trilha { font-size: 12.5px; color: var(--muted); }
.trilha b { color: var(--text); font-weight: 500; }
.aovivo { display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 11px; color: var(--quiet); margin-left: auto; }
.dot { width: 7px; height: 7px; border-radius: 999px; background: var(--ok); flex: none; }
.dot.pulsa { animation: pulso 2s ease-in-out infinite; }
@keyframes pulso { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }

/* Theme toggle */
.icone-botao {
  appearance: none; display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
  background: transparent; border: 1px solid var(--line); color: var(--muted);
}
.icone-botao:hover { border-color: var(--line-2); color: var(--text); }

/* Page */
.pagina { padding: var(--pagepad) 24px 24px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.cabecalho { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.eyebrow { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--primary); }
.cabecalho h1 { margin: 2px 0 3px; font-size: 27px; font-weight: 500; letter-spacing: -.03em; }
.cabecalho p { margin: 0; font-size: 13px; color: var(--muted); }

/* KPI Cards */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.kpi {
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
  padding: var(--cardpad) 16px; box-shadow: var(--shadow);
  display: flex; flex-direction: column; gap: 6px;
}
.kpi-rotulo { font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--quiet); }
.kpi-valor {
  font-family: var(--mono); font-size: 27px; font-weight: 500; letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
}
.kpi-nota { font-size: 11px; color: var(--quiet); }

/* Panels */
.painel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.painel-topo {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: var(--cardpad) 16px; border-bottom: 1px solid var(--line);
}
.painel-topo h2 { margin: 0; font-size: 13.5px; font-weight: 600; }
.painel-corpo { padding: 6px 0; }

/* Dense tables */
table.densa { width: 100%; border-collapse: collapse; }
table.densa th {
  text-align: left; font-family: var(--mono); font-weight: 400; font-size: 10.5px;
  letter-spacing: .08em; text-transform: uppercase; color: var(--quiet);
  padding: 6px 16px 8px; border-bottom: 1px solid var(--hair);
}
table.densa td {
  padding: 13px 16px; border-bottom: 1px solid var(--hair); font-size: 12.5px; vertical-align: middle;
}
table.densa tbody tr:last-child td { border-bottom: 0; }
table.densa tbody tr:hover { background: var(--panel-2); }
table.densa td.mono { font-family: var(--mono); font-size: 12px; }

/* Badges */
.badge {
  display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 5px;
  font-size: 11px; border: 1px solid transparent;
}
.badge.ok { color: var(--ok); background: var(--ok-soft); }
.badge.warn { color: var(--warn); background: var(--warn-soft); }
.badge.err { color: var(--err); background: var(--err-soft); }
.badge.info { color: var(--info); background: var(--primary-soft); }
.badge.quiet { color: var(--quiet); border-color: var(--line); }

/* Buttons */
.acao {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px;
  background: transparent; border: 1px solid var(--line); color: var(--text);
  font: inherit; font-size: 11.5px; cursor: pointer; text-decoration: none;
}
.acao:hover { border-color: var(--line-2); }
.acao:disabled { opacity: .35; cursor: not-allowed; }
.acao.primaria { background: var(--primary); border-color: var(--primary); color: var(--primary-fg); }
.acao.primaria:hover { opacity: .9; }
.acao.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, transparent); }
.acao.ok:hover { background: var(--ok-soft); }
.acao.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
.acao.warn:hover { background: var(--warn-soft); }
.acao.err { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, transparent); }
.acao.err:hover { background: var(--err-soft); }

/* Service health grid */
.servicos { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.servico {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
}
.servico-nome { font-size: 12.5px; font-weight: 500; }
.servico-latencia { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--quiet); }

/* Wizard */
.wizard { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.progresso { display: flex; gap: 4px; }
.progresso-segmento { flex: 1; height: 3px; border-radius: 999px; background: var(--track); }
.progresso-segmento.ativo { background: var(--primary); }
.wizard-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
.wizard-card h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
.wizard-acoes { display: flex; justify-content: space-between; }

/* Form inputs */
.campo { display: flex; flex-direction: column; gap: 4px; }
.campo label { font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--quiet); }
.campo input, .campo select {
  padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--panel-2); color: var(--text); font: inherit; font-size: 12.5px;
}
.campo input:focus, .campo select:focus { outline: none; border-color: var(--primary); }
.campo input::placeholder { color: var(--quiet); }

/* Selector cards (wizard type/table selection) */
.selector { display: flex; flex-direction: column; gap: 8px; }
.selector-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--line); border-radius: 10px; cursor: pointer;
  background: transparent;
}
.selector-item:hover { border-color: var(--line-2); }
.selector-item.selecionado { border-color: var(--primary); background: var(--primary-soft); }
.selector-item b { font-size: 12.5px; font-weight: 500; }
.selector-item small { font-size: 11px; color: var(--quiet); }

/* Config preview */
.config-pre {
  font-family: var(--mono); font-size: 11.5px; line-height: 1.55; color: var(--muted);
  background: var(--bg); border: 1px solid var(--hair); border-radius: 10px;
  padding: 14px; overflow: auto; max-height: 380px; white-space: pre-wrap;
  margin: 0;
}

/* Tabs */
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
.tab {
  appearance: none; border: 0; background: transparent; color: var(--muted);
  font: inherit; font-size: 12.5px; padding: 10px 14px; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text); }
.tab.ativo { color: var(--text); border-bottom-color: var(--primary); }

/* Empty state */
.vazio { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 18px; text-align: center; }
.vazio b { font-size: 13px; font-weight: 500; }
.vazio p { margin: 0; font-size: 11.5px; color: var(--muted); }

/* Loading skeleton */
.esqueleto { background: var(--track); border-radius: 6px; animation: brilho 1.4s ease-in-out infinite; }
@keyframes brilho { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }

/* Connector detail grid */
.detalhe-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; align-items: start; }
@media (max-width: 900px) { .detalhe-grid { grid-template-columns: 1fr; } }

/* Back link */
.voltar {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--quiet);
  text-decoration: none;
}
.voltar:hover { color: var(--text); }

/* Responsive */
@media (max-width: 768px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}
```

- [ ] **Step 3: Remove Tailwind from build**

In `apps/web/vite.config.ts`, remove the tailwindcss plugin:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Remove Tailwind packages**

```bash
cd apps/web && npm uninstall tailwindcss @tailwindcss/vite
```

- [ ] **Step 5: Verify the app builds**

```bash
cd apps/web && npx vite build
```
Expected: Build succeeds with no Tailwind references.

- [ ] **Step 6: Commit**

```bash
git add apps/web/index.html apps/web/src/index.css apps/web/vite.config.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat(web): replace Tailwind with Cora Swarm CSS design system"
```

---

### Task 2: Layout Shell (Sidebar + Topbar)

**Files:**
- Modify: `apps/web/src/components/layout/Layout.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/Topbar.tsx`

**Interfaces:**
- Consumes: CSS classes from Task 1 (`.shell`, `.sidebar`, `.brand`, `.nav`, `.main`, `.topbar`, `.trilha`, `.aovivo`, `.dot`, `.icone-botao`, `.pagina`)
- Produces: `<Layout />` renders the shell with sidebar, topbar, theme toggle, and `<Outlet />` for page content. `useTheme()` is not needed — theme toggle lives directly in `Topbar`.

- [ ] **Step 1: Create `Topbar.tsx`**

Create `apps/web/src/components/layout/Topbar.tsx`:

```tsx
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const pageNames: Record<string, string> = {
  "/": "Dashboard",
  "/connectors": "Connectors",
  "/connectors/new": "Novo Connector",
  "/observability": "Observability",
};

export function Topbar() {
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem("cdc-theme") ?? "escuro");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cdc-theme", theme);
  }, [theme]);

  const pageName = pageNames[location.pathname] ?? location.pathname.split("/").pop() ?? "";

  return (
    <header className="topbar">
      <span className="trilha">CDC Platform / <b>{pageName}</b></span>
      <button
        className="icone-botao"
        onClick={() => setTheme(theme === "escuro" ? "claro" : "escuro")}
        aria-label="Alternar tema"
        style={{ marginLeft: "auto" }}
      >
        {theme === "escuro" ? "☀" : "☾"}
      </button>
      <span className="aovivo" style={{ marginLeft: 0 }}>
        <i className="dot pulsa" />
        <span>auto-refresh 10s</span>
      </span>
    </header>
  );
}
```

- [ ] **Step 2: Rewrite `Sidebar.tsx`**

Replace `apps/web/src/components/layout/Sidebar.tsx`:

```tsx
import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/connectors", label: "Connectors", end: false },
  { to: "/observability", label: "Observability", end: false },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-name">
          <b>CDC Platform</b>
          <small>Control room</small>
        </span>
      </div>
      <div className="nav-label">Workspace</div>
      <nav className="nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => isActive ? "active" : ""}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-rodape">
        <b><i className="dot" /> Local dev</b>
        <small>localhost</small>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Rewrite `Layout.tsx`**

Replace `apps/web/src/components/layout/Layout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function Layout() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <section className="pagina">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the layout renders**

```bash
cd apps/web && npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/
git commit -m "feat(web): rewrite Layout, Sidebar and Topbar with Cora Swarm shell"
```

---

### Task 3: Dashboard Page

**Files:**
- Modify: `apps/web/src/pages/Dashboard.tsx`
- Modify: `apps/web/src/components/dashboard/StatusCard.tsx`
- Modify: `apps/web/src/components/dashboard/ServiceHealth.tsx`

**Interfaces:**
- Consumes: CSS classes `.kpis`, `.kpi`, `.kpi-rotulo`, `.kpi-valor`, `.kpi-nota`, `.cabecalho`, `.eyebrow`, `.servicos`, `.servico`, `.dot`, `.badge`, `.painel`, `.painel-topo`, `.painel-corpo`, `.esqueleto`
- Produces: `<Dashboard />`, `<StatusCard />`, `<ServiceHealth />` render with Cora Swarm styling

- [ ] **Step 1: Rewrite `StatusCard.tsx`**

Replace `apps/web/src/components/dashboard/StatusCard.tsx`:

```tsx
interface StatusCardProps {
  label: string;
  count: number;
  color: "ok" | "warn" | "err" | "quiet";
}

export function StatusCard({ label, count, color }: StatusCardProps) {
  return (
    <div className="kpi">
      <div className="kpi-rotulo">{label}</div>
      <div className="kpi-valor" style={{ color: `var(--${color})` }}>{count}</div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `ServiceHealth.tsx`**

Replace `apps/web/src/components/dashboard/ServiceHealth.tsx`:

```tsx
interface ServiceHealthProps {
  services: Record<string, { status: string; latencyMs: number }>;
}

export function ServiceHealth({ services }: ServiceHealthProps) {
  return (
    <div className="painel">
      <div className="painel-topo">
        <h2>Service Health</h2>
      </div>
      <div className="painel-corpo" style={{ padding: "12px 16px" }}>
        <div className="servicos">
          {Object.entries(services).map(([name, info]) => (
            <div key={name} className="servico">
              <i className="dot" style={{ background: info.status === "up" ? "var(--ok)" : "var(--err)" }} />
              <span className="servico-nome">{name}</span>
              <span className="servico-latencia">{info.latencyMs}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `Dashboard.tsx`**

Replace `apps/web/src/pages/Dashboard.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusCard } from "../components/dashboard/StatusCard";
import { ServiceHealth } from "../components/dashboard/ServiceHealth";

export function Dashboard() {
  const { data: connectors, isLoading: loadingConnectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ["health"],
    queryFn: api.health.getAll,
    refetchInterval: 10_000,
  });

  const running = connectors?.filter((c) => c.state === "RUNNING").length ?? 0;
  const paused = connectors?.filter((c) => c.state === "PAUSED").length ?? 0;
  const failed = connectors?.filter((c) => c.state === "FAILED").length ?? 0;
  const total = connectors?.length ?? 0;

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Control room</div>
          <h1>Dashboard</h1>
          <p>Visao geral dos connectors e servicos do pipeline CDC.</p>
        </div>
      </div>

      {loadingConnectors ? (
        <div className="kpis">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="kpi"><div className="esqueleto" style={{ height: 40, width: "60%" }} /></div>
          ))}
        </div>
      ) : (
        <div className="kpis">
          <StatusCard label="Total" count={total} color="quiet" />
          <StatusCard label="Running" count={running} color="ok" />
          <StatusCard label="Paused" count={paused} color="warn" />
          <StatusCard label="Failed" count={failed} color="err" />
        </div>
      )}

      {loadingHealth ? (
        <div className="painel"><div className="painel-corpo" style={{ padding: 16 }}><div className="esqueleto" style={{ height: 60 }} /></div></div>
      ) : (
        health && <ServiceHealth services={health.services} />
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd apps/web && npx vite build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Dashboard.tsx apps/web/src/components/dashboard/
git commit -m "feat(web): restyle Dashboard, StatusCard and ServiceHealth"
```

---

### Task 4: Connectors List Page

**Files:**
- Modify: `apps/web/src/pages/Connectors.tsx`
- Modify: `apps/web/src/components/connectors/ConnectorActions.tsx`

**Interfaces:**
- Consumes: CSS classes `.painel`, `.painel-topo`, `table.densa`, `.badge`, `.acao`, `.cabecalho`, `.eyebrow`
- Produces: `<Connectors />` and `<ConnectorActions />` render with dense table and badges

- [ ] **Step 1: Rewrite `ConnectorActions.tsx`**

Replace `apps/web/src/components/connectors/ConnectorActions.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ConnectorActionsProps {
  name: string;
  state: string;
}

export function ConnectorActions({ name, state }: ConnectorActionsProps) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["connectors"] });
    queryClient.invalidateQueries({ queryKey: ["connector", name] });
  };

  const pause = useMutation({ mutationFn: () => api.connectors.pause(name), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => api.connectors.resume(name), onSuccess: invalidate });
  const restart = useMutation({ mutationFn: () => api.connectors.restart(name), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.connectors.remove(name), onSuccess: invalidate });

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {state === "RUNNING" && (
        <button className="acao warn" onClick={() => pause.mutate()}>Pause</button>
      )}
      {state === "PAUSED" && (
        <button className="acao ok" onClick={() => resume.mutate()}>Resume</button>
      )}
      <button className="acao" onClick={() => restart.mutate()}>Restart</button>
      <button className="acao err" onClick={() => { if (confirm(`Delete connector "${name}"?`)) remove.mutate(); }}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `Connectors.tsx`**

Replace `apps/web/src/pages/Connectors.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConnectorActions } from "../components/connectors/ConnectorActions";

const stateBadge: Record<string, string> = {
  RUNNING: "ok",
  PAUSED: "warn",
  FAILED: "err",
  UNASSIGNED: "quiet",
};

export function Connectors() {
  const { data: connectors, isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Connectors</h1>
          <p>Gerencie os connectors Debezium e S3 Sink.</p>
        </div>
        <Link to="/connectors/new" className="acao primaria">Novo Connector</Link>
      </div>

      <div className="painel">
        {isLoading ? (
          <div className="painel-corpo" style={{ padding: 16 }}>
            <div className="esqueleto" style={{ height: 120 }} />
          </div>
        ) : !connectors?.length ? (
          <div className="vazio">
            <b>Nenhum connector registrado</b>
            <p>Crie um novo connector para comecar a capturar mudancas.</p>
          </div>
        ) : (
          <table className="densa">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Tasks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((c) => (
                <tr key={c.name}>
                  <td className="mono">
                    <Link to={`/connectors/${c.name}`} style={{ color: "var(--info)", textDecoration: "none" }}>
                      {c.name}
                    </Link>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{c.type}</td>
                  <td>
                    <span className={`badge ${stateBadge[c.state] ?? "quiet"}`}>{c.state}</span>
                  </td>
                  <td className="mono">{c.tasks.length}</td>
                  <td>
                    <ConnectorActions name={c.name} state={c.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd apps/web && npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Connectors.tsx apps/web/src/components/connectors/ConnectorActions.tsx
git commit -m "feat(web): restyle Connectors list and actions with dense table"
```

---

### Task 5: Connector Detail Page

**Files:**
- Modify: `apps/web/src/pages/ConnectorDetail.tsx`

**Interfaces:**
- Consumes: CSS classes `.painel`, `.painel-topo`, `.painel-corpo`, `.config-pre`, `.detalhe-grid`, `.badge`, `.dot`, `.voltar`, `.cabecalho`, `.mono`
- Produces: `<ConnectorDetail />` renders with panel cards and config preview

- [ ] **Step 1: Rewrite `ConnectorDetail.tsx`**

Replace `apps/web/src/pages/ConnectorDetail.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConnectorActions } from "../components/connectors/ConnectorActions";

const stateBadge: Record<string, string> = {
  RUNNING: "ok",
  PAUSED: "warn",
  FAILED: "err",
  UNASSIGNED: "quiet",
};

export function ConnectorDetail() {
  const { name } = useParams<{ name: string }>();
  const { data: connector, isLoading } = useQuery({
    queryKey: ["connector", name],
    queryFn: () => api.connectors.get(name!),
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return <div className="painel"><div className="painel-corpo" style={{ padding: 16 }}><div className="esqueleto" style={{ height: 200 }} /></div></div>;
  }
  if (!connector) {
    return <div className="vazio"><b>Connector not found</b></div>;
  }

  return (
    <>
      <div className="cabecalho">
        <div>
          <Link to="/connectors" className="voltar">&larr; Connectors</Link>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {connector.name}
            <span className={`badge ${stateBadge[connector.state] ?? "quiet"}`}>{connector.state}</span>
          </h1>
        </div>
        <ConnectorActions name={connector.name} state={connector.state} />
      </div>

      <div className="detalhe-grid">
        <div className="painel">
          <div className="painel-topo"><h2>Configuration</h2></div>
          <div className="painel-corpo" style={{ padding: "12px 16px" }}>
            <pre className="config-pre">{JSON.stringify(connector.config, null, 2)}</pre>
          </div>
        </div>

        <div className="painel">
          <div className="painel-topo"><h2>Tasks</h2></div>
          <div className="painel-corpo">
            {connector.tasks.map((task) => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--hair)" }}>
                <i className="dot" style={{ background: task.state === "RUNNING" ? "var(--ok)" : "var(--err)" }} />
                <span className="mono" style={{ fontWeight: 500 }}>Task {task.id}</span>
                <span className={`badge ${stateBadge[task.state] ?? "quiet"}`}>{task.state}</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--quiet)" }}>{task.workerId}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd apps/web && npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ConnectorDetail.tsx
git commit -m "feat(web): restyle ConnectorDetail with panels and config preview"
```

---

### Task 6: New Connector Wizard

**Files:**
- Modify: `apps/web/src/pages/NewConnector.tsx`
- Modify: `apps/web/src/components/wizard/StepSelectType.tsx`
- Modify: `apps/web/src/components/wizard/StepSelectTables.tsx`
- Modify: `apps/web/src/components/wizard/StepOptions.tsx`
- Modify: `apps/web/src/components/wizard/StepPreview.tsx`

**Interfaces:**
- Consumes: CSS classes `.wizard`, `.wizard-card`, `.progresso`, `.progresso-segmento`, `.selector`, `.selector-item`, `.campo`, `.config-pre`, `.acao`, `.wizard-acoes`, `.cabecalho`, `.eyebrow`
- Produces: All wizard components render with Cora Swarm styling

- [ ] **Step 1: Rewrite `StepSelectType.tsx`**

Replace `apps/web/src/components/wizard/StepSelectType.tsx`:

```tsx
interface StepSelectTypeProps {
  value: string;
  onChange: (templateId: string) => void;
}

const types = [
  { id: "debezium-postgres", label: "PostgreSQL Source", desc: "Capture changes from PostgreSQL via Debezium" },
  { id: "debezium-mysql", label: "MySQL Source", desc: "Capture changes from MySQL via Debezium" },
  { id: "s3-sink-minio", label: "MinIO Sink", desc: "Write Kafka topics to MinIO (S3)" },
];

export function StepSelectType({ value, onChange }: StepSelectTypeProps) {
  return (
    <div>
      <h3>Tipo do Connector</h3>
      <div className="selector">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`selector-item ${value === t.id ? "selecionado" : ""}`}
          >
            <div>
              <b>{t.label}</b><br />
              <small>{t.desc}</small>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `StepSelectTables.tsx`**

Replace `apps/web/src/components/wizard/StepSelectTables.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface StepSelectTablesProps {
  database: string;
  selected: string[];
  onChange: (tables: string[]) => void;
}

export function StepSelectTables({ database, selected, onChange }: StepSelectTablesProps) {
  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables", database],
    queryFn: () => api.databases.tables(database),
  });

  if (isLoading) return <div className="esqueleto" style={{ height: 80 }} />;

  const toggle = (fullName: string) => {
    onChange(
      selected.includes(fullName)
        ? selected.filter((t) => t !== fullName)
        : [...selected, fullName]
    );
  };

  return (
    <div>
      <h3>Tabelas</h3>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Database: <span className="mono">{database}</span></p>
      <div className="selector">
        {tables?.map((t) => {
          const fullName = `${t.schema}.${t.name}`;
          return (
            <button
              key={fullName}
              onClick={() => toggle(fullName)}
              className={`selector-item ${selected.includes(fullName) ? "selecionado" : ""}`}
            >
              <div>
                <b className="mono">{fullName}</b>
                {t.rowCount !== null && <><br /><small>~{t.rowCount} rows</small></>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `StepOptions.tsx`**

Replace `apps/web/src/components/wizard/StepOptions.tsx`:

```tsx
interface StepOptionsProps {
  options: { snapshotMode: string; topicPrefix: string; connectorName: string };
  onChange: (options: StepOptionsProps["options"]) => void;
}

export function StepOptions({ options, onChange }: StepOptionsProps) {
  return (
    <div>
      <h3>Opcoes</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="campo">
          <label>Connector Name</label>
          <input
            type="text"
            value={options.connectorName}
            onChange={(e) => onChange({ ...options, connectorName: e.target.value })}
            placeholder="my-connector"
          />
        </div>
        <div className="campo">
          <label>Topic Prefix</label>
          <input
            type="text"
            value={options.topicPrefix}
            onChange={(e) => onChange({ ...options, topicPrefix: e.target.value })}
            placeholder="pg"
          />
        </div>
        <div className="campo">
          <label>Snapshot Mode</label>
          <select
            value={options.snapshotMode}
            onChange={(e) => onChange({ ...options, snapshotMode: e.target.value })}
          >
            <option value="initial">initial — Snapshot + streaming</option>
            <option value="never">never — Streaming only</option>
            <option value="schema_only">schema_only — Schema snapshot, no data</option>
          </select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `StepPreview.tsx`**

Replace `apps/web/src/components/wizard/StepPreview.tsx`:

```tsx
interface StepPreviewProps {
  config: { name: string; config: Record<string, string> } | null;
  isLoading: boolean;
}

export function StepPreview({ config, isLoading }: StepPreviewProps) {
  if (isLoading) return <div className="esqueleto" style={{ height: 120 }} />;
  if (!config) return <div className="vazio"><b>Nenhuma config gerada</b></div>;

  return (
    <div>
      <h3>Revisar Configuracao</h3>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        Connector: <span className="mono" style={{ color: "var(--text)" }}>{config.name}</span>
      </p>
      <pre className="config-pre">{JSON.stringify(config, null, 2)}</pre>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `NewConnector.tsx`**

Replace `apps/web/src/pages/NewConnector.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { StepSelectType } from "../components/wizard/StepSelectType";
import { StepSelectTables } from "../components/wizard/StepSelectTables";
import { StepOptions } from "../components/wizard/StepOptions";
import { StepPreview } from "../components/wizard/StepPreview";

const templateToDb: Record<string, string> = {
  "debezium-postgres": "postgres",
  "debezium-mysql": "mysql",
  "s3-sink-minio": "postgres",
};

const stepLabels = ["Tipo", "Tabelas", "Opcoes", "Revisar"];

export function NewConnector() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [options, setOptions] = useState({
    snapshotMode: "initial",
    topicPrefix: "",
    connectorName: "",
  });

  const database = templateToDb[templateId] ?? "postgres";

  const { data: generatedConfig, isLoading: generating } = useQuery({
    queryKey: ["generate", templateId, selectedTables, options],
    queryFn: () =>
      api.templates.generate({
        templateId,
        database,
        tables: selectedTables,
        options,
      }),
    enabled: step === 3 && selectedTables.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (config: { name: string; config: Record<string, string> }) =>
      api.connectors.create(config),
    onSuccess: () => navigate("/connectors"),
  });

  const steps = [
    <StepSelectType key={0} value={templateId} onChange={setTemplateId} />,
    <StepSelectTables key={1} database={database} selected={selectedTables} onChange={setSelectedTables} />,
    <StepOptions key={2} options={options} onChange={setOptions} />,
    <StepPreview key={3} config={generatedConfig ?? null} isLoading={generating} />,
  ];

  const canNext =
    (step === 0 && templateId) ||
    (step === 1 && selectedTables.length > 0) ||
    step === 2 ||
    (step === 3 && generatedConfig);

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Novo Connector</h1>
          <p>Passo {step + 1} de {stepLabels.length}: {stepLabels[step]}</p>
        </div>
      </div>

      <div className="wizard">
        <div className="progresso">
          {stepLabels.map((_, i) => (
            <div key={i} className={`progresso-segmento ${i <= step ? "ativo" : ""}`} />
          ))}
        </div>

        <div className="wizard-card">{steps[step]}</div>

        <div className="wizard-acoes">
          <button
            className="acao"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Voltar
          </button>

          {step < 3 ? (
            <button
              className="acao primaria"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
            >
              Proximo
            </button>
          ) : (
            <button
              className="acao primaria"
              onClick={() => generatedConfig && createMutation.mutate(generatedConfig)}
              disabled={!generatedConfig || createMutation.isPending}
            >
              {createMutation.isPending ? "Criando..." : "Criar Connector"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd apps/web && npx vite build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/NewConnector.tsx apps/web/src/components/wizard/
git commit -m "feat(web): restyle New Connector wizard with Cora Swarm design"
```

---

### Task 7: Observability Page

**Files:**
- Modify: `apps/web/src/pages/Observability.tsx`

**Interfaces:**
- Consumes: CSS classes `.cabecalho`, `.eyebrow`, `.painel`, `.tabs`, `.tab`, `.servicos`, `.servico`
- Produces: `<Observability />` renders with tabs and dark-styled iframe

- [ ] **Step 1: Rewrite `Observability.tsx`**

Replace `apps/web/src/pages/Observability.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ServiceHealth } from "../components/dashboard/ServiceHealth";

const dashboards = [
  { uid: "cdc-pipeline", title: "CDC Pipeline" },
  { uid: "infrastructure", title: "Infrastructure" },
  { uid: "logs-explorer", title: "Logs Explorer" },
];

const GRAFANA_URL = "http://localhost:3000";

export function Observability() {
  const [activeDashboard, setActiveDashboard] = useState(dashboards[0].uid);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health.getAll,
    refetchInterval: 10_000,
  });

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Monitoring</div>
          <h1>Observability</h1>
          <p>Dashboards Grafana e health check dos servicos.</p>
        </div>
      </div>

      {health && <ServiceHealth services={health.services} />}

      <div className="painel">
        <div className="tabs">
          {dashboards.map((d) => (
            <button
              key={d.uid}
              onClick={() => setActiveDashboard(d.uid)}
              className={`tab ${activeDashboard === d.uid ? "ativo" : ""}`}
            >
              {d.title}
            </button>
          ))}
        </div>
        <iframe
          src={`${GRAFANA_URL}/d/${activeDashboard}?orgId=1&kiosk&theme=dark`}
          style={{ width: "100%", height: 600, border: 0, borderRadius: "0 0 12px 12px", background: "var(--bg)" }}
          title={activeDashboard}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd apps/web && npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Observability.tsx
git commit -m "feat(web): restyle Observability page with tabs and dark iframe"
```

---
