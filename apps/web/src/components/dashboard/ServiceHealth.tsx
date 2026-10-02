interface ServiceHealthProps {
  services: Record<string, { status: string; latencyMs: number }>;
}

export function ServiceHealth({ services }: ServiceHealthProps) {
  return (
    <div className="painel">
      <div className="painel-topo">
        <h2>Service Health</h2>
      </div>
      <div className="painel-corpo" style={{ padding: "12px 16px" }}>
        <div className="servicos">
          {Object.entries(services).map(([name, info]) => (
            <div key={name} className="servico">
              <i className="dot" style={{ background: info.status === "up" ? "var(--ok)" : "var(--err)" }} />
              <span className="servico-nome">{name}</span>
              <span className="servico-latencia">{info.latencyMs}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
