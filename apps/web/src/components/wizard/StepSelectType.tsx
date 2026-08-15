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
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Select Connector Type</h3>
      <div className="grid gap-3">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`text-left p-4 rounded-lg border-2 transition ${
              value === t.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-medium">{t.label}</p>
            <p className="text-sm text-gray-500">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
