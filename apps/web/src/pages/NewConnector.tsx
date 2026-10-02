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

const stepLabels = ["Tipo", "Tabelas", "Opcoes", "Revisar"];

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
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Novo Connector</h1>
          <p>Passo {step + 1} de {stepLabels.length}: {stepLabels[step]}</p>
        </div>
      </div>

      <div className="wizard">
        <div className="progresso">
          {stepLabels.map((_, i) => (
            <div key={i} className={`progresso-segmento ${i <= step ? "ativo" : ""}`} />
          ))}
        </div>

        <div className="wizard-card">{steps[step]}</div>

        <div className="wizard-acoes">
          <button
            className="acao"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Voltar
          </button>

          {step < 3 ? (
            <button
              className="acao primaria"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
            >
              Proximo
            </button>
          ) : (
            <button
              className="acao primaria"
              onClick={() => generatedConfig && createMutation.mutate(generatedConfig)}
              disabled={!generatedConfig || createMutation.isPending}
            >
              {createMutation.isPending ? "Criando..." : "Criar Connector"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
