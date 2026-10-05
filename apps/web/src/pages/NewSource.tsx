import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { StepSelectTables } from "../components/wizard/StepSelectTables";
import { StepOptions } from "../components/wizard/StepOptions";
import { StepPreview } from "../components/wizard/StepPreview";

const sourceTypes = [
  { id: "debezium-postgres", label: "PostgreSQL", desc: "Captura mudancas do PostgreSQL via Debezium", db: "postgres" },
  { id: "debezium-mysql", label: "MySQL", desc: "Captura mudancas do MySQL via Debezium", db: "mysql" },
];

const stepLabels = ["Tipo", "Tabelas", "Opcoes", "Revisar"];

export function NewSource() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [options, setOptions] = useState({
    snapshotMode: "initial",
    topicPrefix: "",
    connectorName: "",
  });

  const sourceType = sourceTypes.find((s) => s.id === templateId);
  const database = sourceType?.db ?? "postgres";

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
    onSuccess: () => navigate("/sources"),
  });

  const canNext =
    (step === 0 && templateId) ||
    (step === 1 && selectedTables.length > 0) ||
    (step === 2 && options.connectorName.trim() !== "") ||
    (step === 3 && generatedConfig);

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1>Novo Source</h1>
          <p>Passo {step + 1} de {stepLabels.length}: {stepLabels[step]}</p>
        </div>
      </div>

      <div className="wizard">
        <div className="progresso">
          {stepLabels.map((_, i) => (
            <div key={i} className={`progresso-segmento ${i <= step ? "ativo" : ""}`} />
          ))}
        </div>

        <div className="wizard-card">
          {step === 0 && (
            <div>
              <h3>Tipo do Source</h3>
              <div className="selector">
                {sourceTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`selector-item ${templateId === t.id ? "selecionado" : ""}`}
                  >
                    <div>
                      <b>{t.label}</b><br />
                      <small>{t.desc}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 1 && (
            <StepSelectTables database={database} selected={selectedTables} onChange={setSelectedTables} />
          )}
          {step === 2 && (
            <StepOptions options={options} onChange={setOptions} />
          )}
          {step === 3 && (
            <StepPreview config={generatedConfig ?? null} isLoading={generating} />
          )}
        </div>

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
              {createMutation.isPending ? "Criando..." : "Criar Source"}
            </button>
          )}
        </div>

        {createMutation.isError && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--err-soft)", border: "1px solid var(--err)", color: "var(--err)", fontSize: 12 }}>
            Erro ao criar source: {(createMutation.error as Error).message}
          </div>
        )}
      </div>
    </>
  );
}
