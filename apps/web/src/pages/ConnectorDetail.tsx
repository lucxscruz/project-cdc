import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConnectorActions } from "../components/connectors/ConnectorActions";

export function ConnectorDetail() {
  const { name } = useParams<{ name: string }>();
  const { data: connector, isLoading } = useQuery({
    queryKey: ["connector", name],
    queryFn: () => api.connectors.get(name!),
    refetchInterval: 10_000,
  });

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (!connector) return <p className="text-red-500">Connector not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/connectors" className="text-gray-400 hover:text-gray-600">&larr;</Link>
        <h2 className="text-2xl font-bold text-gray-900">{connector.name}</h2>
        <ConnectorActions name={connector.name} state={connector.state} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Configuration</h3>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-96">
            {JSON.stringify(connector.config, null, 2)}
          </pre>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Tasks</h3>
          <div className="space-y-2">
            {connector.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                <span className={`w-2 h-2 rounded-full ${task.state === "RUNNING" ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-sm font-medium">Task {task.id}</span>
                <span className="text-xs text-gray-500">{task.state}</span>
                <span className="text-xs text-gray-400 ml-auto">{task.workerId}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
