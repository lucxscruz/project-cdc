import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

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

function SourceCard({
  source,
  dbTables,
}: {
  source: SourceConnector;
  dbTables: Array<{ name: string; schema: string; rowCount: number | null }>;
}) {
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["connectors"] });
    queryClient.invalidateQueries({ queryKey: ["connector-details"] });
  };

  const pauseMut = useMutation({ mutationFn: () => api.connectors.pause(source.name), onSuccess: invalidate });
  const resumeMut = useMutation({ mutationFn: () => api.connectors.resume(source.name), onSuccess: invalidate });
  const restartMut = useMutation({ mutationFn: () => api.connectors.restart(source.name), onSuccess: invalidate });

  const updateTablesMut = useMutation({
    mutationFn: (newTables: string[]) =>
      api.connectors.update(source.name, {
        ...source.config,
        "table.include.list": newTables.join(","),
      }),
    onSuccess: invalidate,
  });

  const removeTable = (table: string) => {
    if (!confirm(`Remover "${table}" da replicacao do connector "${source.name}"?`)) return;
    const newTables = source.tables.filter((t) => t !== table);
    updateTablesMut.mutate(newTables);
  };

  const addTable = (table: string) => {
    const newTables = [...source.tables, table];
    updateTablesMut.mutate(newTables);
  };

  const replicatedTables = source.tables;
  const notReplicated = dbTables.filter(
    (t) => !replicatedTables.includes(`${t.schema}.${t.name}`)
  );
  const details = connectionDetails(source.config);

  return (
    <div className="painel">
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
        <div style={{ display: "flex", gap: 6 }}>
          <button className="acao" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "Ocultar" : "Detalhes"}
          </button>
          {source.state === "RUNNING" && (
            <button className="acao warn" onClick={() => pauseMut.mutate()} disabled={pauseMut.isPending}>Pause</button>
          )}
          {source.state === "PAUSED" && (
            <button className="acao ok" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}>Resume</button>
          )}
          <button className="acao" onClick={() => restartMut.mutate()} disabled={restartMut.isPending}>Restart</button>
        </div>
      </div>

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
        {replicatedTables.length === 0 ? (
          <div className="vazio">
            <b>Nenhuma tabela configurada</b>
          </div>
        ) : (
          <table className="densa">
            <thead>
              <tr>
                <th>Tabela</th>
                <th>Topico</th>
                <th>Status</th>
                <th>Rows</th>
                <th style={{ textAlign: "right" }}>Acao</th>
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
                      <button
                        className="acao err"
                        onClick={() => removeTable(table)}
                        disabled={updateTablesMut.isPending}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {notReplicated.length > 0 && (
          <>
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--quiet)" }}>
                Tabelas disponiveis ({notReplicated.length})
              </span>
            </div>
            <table className="densa">
              <tbody>
                {notReplicated.map((t) => {
                  const fullName = `${t.schema}.${t.name}`;
                  return (
                    <tr key={fullName} style={{ opacity: 0.6 }}>
                      <td className="mono">{fullName}</td>
                      <td style={{ color: "var(--quiet)", fontSize: 11 }}>{"\u2014"}</td>
                      <td><span className="badge quiet">Sem CDC</span></td>
                      <td className="mono" style={{ color: "var(--quiet)" }}>
                        {t.rowCount != null ? `~${t.rowCount}` : "\u2014"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="acao ok"
                          onClick={() => addTable(fullName)}
                          disabled={updateTablesMut.isPending}
                        >
                          Adicionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

export function Replication() {
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
          <p>Visao das tabelas replicadas por cada source connector.</p>
        </div>
      </div>

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
