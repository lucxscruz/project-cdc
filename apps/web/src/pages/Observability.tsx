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
