interface StepPreviewProps {
  config: { name: string; config: Record<string, string> } | null;
  isLoading: boolean;
}

export function StepPreview({ config, isLoading }: StepPreviewProps) {
  if (isLoading) return <div className="esqueleto" style={{ height: 120 }} />;
  if (!config) return <div className="vazio"><b>Nenhuma config gerada</b></div>;

  return (
    <div>
      <h3>Revisar Configuracao</h3>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        Connector: <span className="mono" style={{ color: "var(--text)" }}>{config.name}</span>
      </p>
      <pre className="config-pre">{JSON.stringify(config, null, 2)}</pre>
    </div>
  );
}
