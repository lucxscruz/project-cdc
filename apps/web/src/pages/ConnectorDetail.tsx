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
