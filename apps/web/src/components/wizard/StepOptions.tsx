interface StepOptionsProps {
  options: { snapshotMode: string; topicPrefix: string; connectorName: string };
  onChange: (options: StepOptionsProps["options"]) => void;
}

export function StepOptions({ options, onChange }: StepOptionsProps) {
  return (
    <div>
      <h3>Opcoes</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="campo">
          <label>Connector Name</label>
          <input
            type="text"
            value={options.connectorName}
            onChange={(e) => onChange({ ...options, connectorName: e.target.value })}
            placeholder="my-connector"
          />
        </div>
        <div className="campo">
          <label>Topic Prefix</label>
          <input
            type="text"
            value={options.topicPrefix}
            onChange={(e) => onChange({ ...options, topicPrefix: e.target.value })}
            placeholder="pg"
          />
        </div>
        <div className="campo">
          <label>Snapshot Mode</label>
          <select
            value={options.snapshotMode}
            onChange={(e) => onChange({ ...options, snapshotMode: e.target.value })}
          >
            <option value="initial">initial — Snapshot + streaming</option>
            <option value="never">never — Streaming only</option>
            <option value="schema_only">schema_only — Schema snapshot, no data</option>
          </select>
        </div>
      </div>
    </div>
  );
}
