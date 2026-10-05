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

export function Sources() {
  const { data: connectors, isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  const sources = connectors?.filter((c) => c.type === "source") ?? [];

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Sources</h1>
          <p>Connectors Debezium que capturam mudancas dos bancos de dados.</p>
        </div>
        <Link to="/sources/new" className="acao primaria">Novo Source</Link>
      </div>

      <div className="painel">
        {isLoading ? (
          <div className="painel-corpo" style={{ padding: 16 }}>
            <div className="esqueleto" style={{ height: 120 }} />
          </div>
        ) : !sources.length ? (
          <div className="vazio">
            <b>Nenhum source registrado</b>
            <p>Crie um source connector para comecar a capturar mudancas.</p>
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
              {sources.map((c) => (
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
