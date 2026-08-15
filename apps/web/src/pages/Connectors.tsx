import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ConnectorActions } from "../components/connectors/ConnectorActions";

const stateColors: Record<string, string> = {
  RUNNING: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
  UNASSIGNED: "bg-gray-100 text-gray-800",
};

export function Connectors() {
  const { data: connectors, isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: api.connectors.list,
    refetchInterval: 10_000,
  });

  if (isLoading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Connectors</h2>
        <Link
          to="/connectors/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-700"
        >
          New Connector
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium text-gray-500">Name</th>
              <th className="text-left p-3 font-medium text-gray-500">Type</th>
              <th className="text-left p-3 font-medium text-gray-500">Status</th>
              <th className="text-left p-3 font-medium text-gray-500">Tasks</th>
              <th className="text-left p-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {connectors?.map((c) => (
              <tr key={c.name} className="hover:bg-gray-50">
                <td className="p-3">
                  <Link
                    to={`/connectors/${c.name}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="p-3 text-gray-600">{c.type}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${stateColors[c.state] ?? stateColors.UNASSIGNED}`}>
                    {c.state}
                  </span>
                </td>
                <td className="p-3 text-gray-600">{c.tasks.length}</td>
                <td className="p-3">
                  <ConnectorActions name={c.name} state={c.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
