interface ServiceHealthProps {
  services: Record<string, { status: string; latencyMs: number }>;
}

export function ServiceHealth({ services }: ServiceHealthProps) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-3">Service Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(services).map(([name, info]) => (
          <div
            key={name}
            className="flex items-center gap-2 p-2 rounded border"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                info.status === "up" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {info.latencyMs}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
