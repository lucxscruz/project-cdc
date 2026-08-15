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
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Observability</h2>

      {health && <ServiceHealth services={health.services} />}

      <div className="bg-white rounded-lg border">
        <div className="flex border-b">
          {dashboards.map((d) => (
            <button
              key={d.uid}
              onClick={() => setActiveDashboard(d.uid)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeDashboard === d.uid
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>

        <iframe
          src={`${GRAFANA_URL}/d/${activeDashboard}?orgId=1&kiosk`}
          className="w-full border-0"
          style={{ height: "600px" }}
          title={activeDashboard}
        />
      </div>
    </div>
  );
}
