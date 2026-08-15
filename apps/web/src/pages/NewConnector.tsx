import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { StepSelectType } from "../components/wizard/StepSelectType";
import { StepSelectTables } from "../components/wizard/StepSelectTables";
import { StepOptions } from "../components/wizard/StepOptions";
import { StepPreview } from "../components/wizard/StepPreview";

const templateToDb: Record<string, string> = {
  "debezium-postgres": "postgres",
  "debezium-mysql": "mysql",
  "s3-sink-minio": "postgres",
};

export function NewConnector() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [options, setOptions] = useState({
    snapshotMode: "initial",
    topicPrefix: "",
    connectorName: "",
  });

  const database = templateToDb[templateId] ?? "postgres";

  const { data: generatedConfig, isLoading: generating } = useQuery({
    queryKey: ["generate", templateId, selectedTables, options],
    queryFn: () =>
      api.templates.generate({
        templateId,
        database,
        tables: selectedTables,
        options,
      }),
    enabled: step === 3 && selectedTables.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (config: { name: string; config: Record<string, string> }) =>
      api.connectors.create(config),
    onSuccess: () => navigate("/connectors"),
  });

  const steps = [
    <StepSelectType key={0} value={templateId} onChange={setTemplateId} />,
    <StepSelectTables key={1} database={database} selected={selectedTables} onChange={setSelectedTables} />,
    <StepOptions key={2} options={options} onChange={setOptions} />,
    <StepPreview key={3} config={generatedConfig ?? null} isLoading={generating} />,
  ];

  const canNext =
    (step === 0 && templateId) ||
    (step === 1 && selectedTables.length > 0) ||
    step === 2 ||
    (step === 3 && generatedConfig);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">New Connector</h2>

      <div className="flex gap-2 mb-6">
        {["Type", "Tables", "Options", "Review"].map((label, i) => (
          <div
            key={label}
            className={`flex-1 h-1 rounded ${i <= step ? "bg-gray-900" : "bg-gray-200"}`}
          />
        ))}
      </div>

      <div className="bg-white rounded-lg border p-6">{steps[step]}</div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="px-4 py-2 text-sm border rounded-md disabled:opacity-30"
        >
          Back
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md disabled:opacity-30"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => generatedConfig && createMutation.mutate(generatedConfig)}
            disabled={!generatedConfig || createMutation.isPending}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md disabled:opacity-30"
          >
            {createMutation.isPending ? "Creating..." : "Create Connector"}
          </button>
        )}
      </div>
    </div>
  );
}
