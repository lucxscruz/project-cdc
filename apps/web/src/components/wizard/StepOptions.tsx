interface StepOptionsProps {
  options: { snapshotMode: string; topicPrefix: string; connectorName: string };
  onChange: (options: StepOptionsProps["options"]) => void;
}

export function StepOptions({ options, onChange }: StepOptionsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Advanced Options</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Connector Name</label>
        <input
          type="text"
          value={options.connectorName}
          onChange={(e) => onChange({ ...options, connectorName: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
          placeholder="my-connector"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Topic Prefix</label>
        <input
          type="text"
          value={options.topicPrefix}
          onChange={(e) => onChange({ ...options, topicPrefix: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
          placeholder="pg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Snapshot Mode</label>
        <select
          value={options.snapshotMode}
          onChange={(e) => onChange({ ...options, snapshotMode: e.target.value })}
          className="w-full px-3 py-2 border rounded-md text-sm"
        >
          <option value="initial">initial — Snapshot + streaming</option>
          <option value="never">never — Streaming only</option>
          <option value="schema_only">schema_only — Schema snapshot, no data</option>
        </select>
      </div>
    </div>
  );
}
