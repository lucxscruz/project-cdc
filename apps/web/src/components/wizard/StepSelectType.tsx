interface StepSelectTypeProps {
  value: string;
  onChange: (templateId: string) => void;
}

const types = [
  { id: "debezium-postgres", label: "PostgreSQL Source", desc: "Capture changes from PostgreSQL via Debezium" },
  { id: "debezium-mysql", label: "MySQL Source", desc: "Capture changes from MySQL via Debezium" },
  { id: "s3-sink-minio", label: "MinIO Sink", desc: "Write Kafka topics to MinIO (S3)" },
];

export function StepSelectType({ value, onChange }: StepSelectTypeProps) {
  return (
    <div>
      <h3>Tipo do Connector</h3>
      <div className="selector">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`selector-item ${value === t.id ? "selecionado" : ""}`}
          >
            <div>
              <b>{t.label}</b><br />
              <small>{t.desc}</small>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
