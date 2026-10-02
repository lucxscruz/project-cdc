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
