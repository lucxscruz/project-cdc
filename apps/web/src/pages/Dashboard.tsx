import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusCard } from "../components/dashboard/StatusCard";
import { ServiceHealth } from "../components/dashboard/ServiceHealth";

export function Dashboard() {
  const {
    data: connectors,
    isLoading: loadingConnectors,
    isError: connectorsError,
  } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  const {
    data: health,
    isLoading: loadingHealth,
    isError: healthError,
  } = useQuery({
    queryKey: ["health"],
    queryFn: api.health.getAll,
    refetchInterval: 10_000,
  });

  const running = connectors?.filter((c) => c.state === "RUNNING").length ?? 0;
  const paused = connectors?.filter((c) => c.state === "PAUSED").length ?? 0;
  const failed = connectors?.filter((c) => c.state === "FAILED").length ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {/* Connector status cards */}
      {loadingConnectors ? (
        <p className="text-gray-500">Loading connectors…</p>
      ) : connectorsError ? (
        <p className="text-red-600 text-sm">Failed to load connector data.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusCard label="Running" count={running} color="green" />
          <StatusCard label="Paused" count={paused} color="yellow" />
          <StatusCard label="Failed" count={failed} color="red" />
        </div>
      )}

      {/* Service health */}
      {loadingHealth ? (
        <p className="text-gray-500">Loading health…</p>
      ) : healthError ? (
        <p className="text-red-600 text-sm">Failed to load service health.</p>
      ) : (
        health && <ServiceHealth services={health.services} />
      )}
    </div>
  );
}
