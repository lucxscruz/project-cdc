interface StatusCardProps {
  label: string;
  count: number;
  color: "ok" | "warn" | "err" | "quiet";
}

export function StatusCard({ label, count, color }: StatusCardProps) {
  return (
    <div className="kpi">
      <div className="kpi-rotulo">{label}</div>
      <div className="kpi-valor" style={{ color: `var(--${color})` }}>{count}</div>
    </div>
  );
}
