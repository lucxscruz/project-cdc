import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

// ── Helpers de persistência local (pausadas) ────────────────────────

const PAUSED_KEY = "cdc-paused-tables";

function loadPaused(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(PAUSED_KEY) ?? "{}"); } catch { return {}; }
}

function savePaused(data: Record<string, string[]>) {
  localStorage.setItem(PAUSED_KEY, JSON.stringify(data));
}

function markPaused(connector: string, table: string) {
  const d = loadPaused();
  d[connector] = [...new Set([...(d[connector] ?? []), table])];
  savePaused(d);
}

function unmarkPaused(connector: string, table: string) {
  const d = loadPaused();
  d[connector] = (d[connector] ?? []).filter((t) => t !== table);
  if (d[connector].length === 0) delete d[connector];
  savePaused(d);
}

function getPausedTables(connector: string): Set<string> {
  return new Set(loadPaused()[connector] ?? []);
}

// ── Tipos ────────────────────────────────────────────────────────────

interface SourceConnector {
  name: string;
  state: string;
  database: string;
  topicPrefix: string;
  tables: string[];
  config: Record<string, string>;
}

function parseSourceConnectors(
  connectors: Array<{ name: string; state: string }>,
  details: Array<{ name: string; config: Record<string, string> } | null>,
): SourceConnector[] {
  const sources: SourceConnector[] = [];

  for (let i = 0; i < connectors.length; i++) {
    const c = connectors[i];
    const d = details[i];
    if (!d?.config) continue;

    const cfg = d.config;
    const connectorClass = cfg["connector.class"] ?? "";

    const isSource = connectorClass.includes("debezium") || connectorClass.includes("Source") || connectorClass.includes("source");
    if (!isSource) continue;

    const tableList = cfg["table.include.list"] ?? "";
    const tables = tableList ? tableList.split(",").map((t) => t.trim()) : [];

    let database = "unknown";
    if (connectorClass.includes("postgresql") || connectorClass.includes("Postgres")) {
      database = "postgres";
    } else if (connectorClass.includes("mysql") || connectorClass.includes("MySql")) {
      database = "mysql";
    }

    sources.push({
      name: c.name,
      state: c.state,
      database,
      topicPrefix: cfg["topic.prefix"] ?? "",
      tables,
      config: cfg,
    });
  }

  return sources;
}

function connectionDetails(cfg: Record<string, string>): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  const add = (label: string, key: string) => {
    const v = cfg[key];
    if (v) fields.push({ label, value: v });
  };
  add("Host", "database.hostname");
  add("Port", "database.port");
  add("User", "database.user");
  add("Database", "database.dbname");
  add("Database", "database.include.list");
  add("Snapshot Mode", "snapshot.mode");
  add("Plugin", "plugin.name");
  add("Slot", "slot.name");
  add("Publication", "publication.name");
  add("Server ID", "database.server.id");
  add("Schema Registry", "key.converter.schema.registry.url");
  return fields;
}

const stateBadge: Record<string, string> = {
  RUNNING: "ok",
  PAUSED: "warn",
  FAILED: "err",
};

// ── Componente por source ────────────────────────────────────────────

function SourceCard({
  source,
  dbTables,
}: {
  source: SourceConnector;
  dbTables: Array<{ name: string; schema: string; rowCount: number | null }>;
}) {
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);
  const [, forceRender] = useState(0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["connectors"] });
    queryClient.invalidateQueries({ queryKey: ["connector-details"] });
  };

  const updateTablesMut = useMutation({
    mutationFn: (newTables: string[]) =>
      api.connectors.update(source.name, {
        ...source.config,
        "table.include.list": newTables.join(","),
      }),
    onSuccess: invalidate,
  });

  const pauseTable = (table: string) => {
    markPaused(source.name, table);
    const newTables = source.tables.filter((t) => t !== table);
    updateTablesMut.mutate(newTables, {
      onSuccess: () => forceRender((n) => n + 1),
    });
  };

  const resumeTable = (table: string) => {
    unmarkPaused(source.name, table);
    const newTables = [...source.tables, table];
    updateTablesMut.mutate(newTables, {
      onSuccess: () => forceRender((n) => n + 1),
    });
  };

  const removeTable = (table: string) => {
    if (!confirm(`Remover "${table}" permanentemente da replicacao?`)) return;
    unmarkPaused(source.name, table);
    const newTables = source.tables.filter((t) => t !== table);
    updateTablesMut.mutate(newTables);
  };

  const addTable = (table: string) => {
    unmarkPaused(source.name, table);
    const newTables = [...source.tables, table];
    updateTablesMut.mutate(newTables);
  };

  const pausedSet = getPausedTables(source.name);
  const replicatedTables = source.tables;

  const notReplicated = dbTables
    .map((t) => ({ ...t, fullName: `${t.schema}.${t.name}` }))
    .filter((t) => !replicatedTables.includes(t.fullName));

  const pausedTables = notReplicated.filter((t) => pausedSet.has(t.fullName));
  const availableTables = notReplicated.filter((t) => !pausedSet.has(t.fullName));

  const details = connectionDetails(source.config);

  return (
    <div className="painel">
      {/* Header */}
      <div className="painel-topo">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2>
            <Link to={`/connectors/${source.name}`} style={{ color: "var(--info)", textDecoration: "none" }}>
              {source.name}
            </Link>
          </h2>
          <span className={`badge ${stateBadge[source.state] ?? "quiet"}`}>{source.state}</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--quiet)" }}>
            {source.database} &middot; prefix: {source.topicPrefix}
          </span>
        </div>
        <button className="acao" onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? "Ocultar detalhes" : "Detalhes da conexao"}
        </button>
      </div>

      {/* Connection details (collapsible) */}
      {showDetails && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px 20px" }}>
          {details.map((d) => (
            <div key={d.label + d.value} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--quiet)" }}>
                {d.label}
              </span>
              <span className="mono" style={{ fontSize: 12 }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="painel-corpo">
        {/* ── Tabelas replicando ── */}
        {replicatedTables.length === 0 && pausedTables.length === 0 ? (
          <div className="vazio">
            <b>Nenhuma tabela configurada</b>
          </div>
        ) : (
          <>
            {replicatedTables.length > 0 && (
              <table className="densa">
                <thead>
                  <tr>
                    <th>Tabela</th>
                    <th>Topico</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th style={{ textAlign: "right" }}>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {replicatedTables.map((table) => {
                    const parts = table.split(".");
                    const schema = parts[0];
                    const tableName = parts.slice(1).join(".");
                    const topic = `${source.topicPrefix}.${table}`;
                    const dbTable = dbTables.find(
                      (t) => t.schema === schema && t.name === tableName
                    );

                    return (
                      <tr key={table}>
                        <td className="mono">{table}</td>
                        <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{topic}</td>
                        <td><span className="badge ok">Replicando</span></td>
                        <td className="mono" style={{ color: "var(--quiet)" }}>
                          {dbTable?.rowCount != null ? `~${dbTable.rowCount}` : "\u2014"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 4 }}>
                            <button
                              className="acao-icone warn"
                              onClick={() => pauseTable(table)}
                              disabled={updateTablesMut.isPending}
                              title="Pausar replicacao"
                            >
                              ⏸
                            </button>
                            <button
                              className="acao-icone err"
                              onClick={() => removeTable(table)}
                              disabled={updateTablesMut.isPending}
                              title="Remover da replicacao"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* ── Tabelas pausadas ── */}
            {pausedTables.length > 0 && (
              <>
                <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--warn)" }}>
                    Pausadas ({pausedTables.length})
                  </span>
                </div>
                <table className="densa">
                  <tbody>
                    {pausedTables.map((t) => (
                      <tr key={t.fullName} style={{ opacity: 0.7 }}>
                        <td className="mono">{t.fullName}</td>
                        <td className="mono" style={{ color: "var(--quiet)", fontSize: 11 }}>
                          {source.topicPrefix}.{t.fullName}
                        </td>
                        <td><span className="badge warn">Pausada</span></td>
                        <td className="mono" style={{ color: "var(--quiet)" }}>
                          {t.rowCount != null ? `~${t.rowCount}` : "\u2014"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 4 }}>
                            <button
                              className="acao-icone ok"
                              onClick={() => resumeTable(t.fullName)}
                              disabled={updateTablesMut.isPending}
                              title="Retomar replicacao"
                            >
                              ▶
                            </button>
                            <button
                              className="acao-icone err"
                              onClick={() => {
                                unmarkPaused(source.name, t.fullName);
                                forceRender((n) => n + 1);
                              }}
                              title="Remover da replicacao"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {/* ── Tabelas disponiveis (adicionar) ── */}
        {availableTables.length > 0 && (
          <>
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--quiet)" }}>
                Disponiveis para adicionar ({availableTables.length})
              </span>
            </div>
            <table className="densa">
              <tbody>
                {availableTables.map((t) => (
                  <tr key={t.fullName} style={{ opacity: 0.5 }}>
                    <td className="mono">{t.fullName}</td>
                    <td style={{ color: "var(--quiet)", fontSize: 11 }}>{"\u2014"}</td>
                    <td><span className="badge quiet">Sem CDC</span></td>
                    <td className="mono" style={{ color: "var(--quiet)" }}>
                      {t.rowCount != null ? `~${t.rowCount}` : "\u2014"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="acao-icone ok"
                        onClick={() => addTable(t.fullName)}
                        disabled={updateTablesMut.isPending}
                        title="Adicionar a replicacao"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Painel de adicionar tabela ────────────────────────────────────────

function AddTablePanel({
  sources,
  tablesByDb,
  onClose,
}: {
  sources: SourceConnector[];
  tablesByDb: Map<string, Array<{ name: string; schema: string; rowCount: number | null }>>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState(sources[0]?.name ?? "");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());

  const source = sources.find((s) => s.name === selectedSource);
  const dbTables = source ? (tablesByDb.get(source.database) ?? []) : [];
  const available = dbTables
    .map((t) => ({ ...t, fullName: `${t.schema}.${t.name}` }))
    .filter((t) => !source?.tables.includes(t.fullName));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["connectors"] });
    queryClient.invalidateQueries({ queryKey: ["connector-details"] });
  };

  const addMut = useMutation({
    mutationFn: () => {
      if (!source) return Promise.resolve();
      const newTables = [...source.tables, ...selectedTables];
      return api.connectors.update(source.name, {
        ...source.config,
        "table.include.list": newTables.join(","),
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const toggle = (fullName: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  return (
    <div className="painel">
      <div className="painel-topo">
        <h2>Adicionar tabelas a replicacao</h2>
        <button className="acao" onClick={onClose}>Cancelar</button>
      </div>
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Step 1: select source */}
        <div className="campo">
          <label>Source connector</label>
          <select
            value={selectedSource}
            onChange={(e) => { setSelectedSource(e.target.value); setSelectedTables(new Set()); }}
          >
            {sources.map((s) => (
              <option key={s.name} value={s.name}>{s.name} ({s.database})</option>
            ))}
          </select>
        </div>

        {/* Step 2: select tables */}
        {available.length === 0 ? (
          <div className="vazio" style={{ padding: "16px 0" }}>
            <b>Todas as tabelas ja estao sendo replicadas</b>
            <p>Nao ha tabelas disponiveis para adicionar neste source.</p>
          </div>
        ) : (
          <>
            <div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--quiet)" }}>
                Selecione as tabelas ({selectedTables.size} de {available.length})
              </span>
            </div>
            <div className="selector">
              {available.map((t) => (
                <button
                  key={t.fullName}
                  onClick={() => toggle(t.fullName)}
                  className={`selector-item ${selectedTables.has(t.fullName) ? "selecionado" : ""}`}
                >
                  <div style={{ flex: 1 }}>
                    <b className="mono">{t.fullName}</b>
                    {t.rowCount != null && <><br /><small>~{t.rowCount} rows</small></>}
                  </div>
                  <span style={{ fontSize: 16, color: selectedTables.has(t.fullName) ? "var(--ok)" : "var(--quiet)" }}>
                    {selectedTables.has(t.fullName) ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="acao" onClick={onClose}>Cancelar</button>
              <button
                className="acao primaria"
                onClick={() => addMut.mutate()}
                disabled={selectedTables.size === 0 || addMut.isPending}
              >
                {addMut.isPending ? "Adicionando..." : `Adicionar ${selectedTables.size} tabela${selectedTables.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Pagina principal ─────────────────────────────────────────────────

export function Replication() {
  const [showAddPanel, setShowAddPanel] = useState(false);

  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  const connectorNames = connectors?.map((c) => c.name) ?? [];

  const { data: details, isLoading } = useQuery({
    queryKey: ["connector-details", connectorNames],
    queryFn: () => Promise.all(connectorNames.map((n) => api.connectors.get(n).catch(() => null))),
    enabled: connectorNames.length > 0,
    refetchInterval: 10_000,
  });

  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: api.databases.list,
  });

  const dbNames = databases?.map((d) => d.name) ?? [];

  const { data: allTables } = useQuery({
    queryKey: ["all-tables", dbNames],
    queryFn: () =>
      Promise.all(
        dbNames.map((db) =>
          api.databases.tables(db).then((tables) => ({ db, tables }))
        )
      ),
    enabled: dbNames.length > 0,
  });

  const sources = connectors && details ? parseSourceConnectors(connectors, details) : [];

  const tablesByDb = new Map<string, Array<{ name: string; schema: string; rowCount: number | null }>>();
  allTables?.forEach(({ db, tables }) => tablesByDb.set(db, tables));

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Replication</h1>
          <p>Gerencie a replicacao de cada tabela individualmente.</p>
        </div>
        {sources.length > 0 && !showAddPanel && (
          <button className="acao primaria" onClick={() => setShowAddPanel(true)}>
            + Adicionar tabela
          </button>
        )}
      </div>

      {showAddPanel && sources.length > 0 && (
        <AddTablePanel
          sources={sources}
          tablesByDb={tablesByDb}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      {isLoading ? (
        <div className="painel">
          <div className="painel-corpo" style={{ padding: 16 }}>
            <div className="esqueleto" style={{ height: 120 }} />
          </div>
        </div>
      ) : sources.length === 0 ? (
        <div className="painel">
          <div className="vazio">
            <b>Nenhum source connector encontrado</b>
            <p>Crie um connector Debezium para comecar a replicar tabelas.</p>
          </div>
        </div>
      ) : (
        sources.map((source) => (
          <SourceCard
            key={source.name}
            source={source}
            dbTables={tablesByDb.get(source.database) ?? []}
          />
        ))
      )}
    </>
  );
}
