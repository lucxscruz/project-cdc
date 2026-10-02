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
