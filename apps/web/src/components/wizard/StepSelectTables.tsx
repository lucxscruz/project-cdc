import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface StepSelectTablesProps {
  database: string;
  selected: string[];
  onChange: (tables: string[]) => void;
}

export function StepSelectTables({ database, selected, onChange }: StepSelectTablesProps) {
  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables", database],
    queryFn: () => api.databases.tables(database),
  });

  if (isLoading) return <div className="esqueleto" style={{ height: 80 }} />;

  const toggle = (fullName: string) => {
    onChange(
      selected.includes(fullName)
        ? selected.filter((t) => t !== fullName)
        : [...selected, fullName]
    );
  };

  return (
    <div>
      <h3>Tabelas</h3>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Database: <span className="mono">{database}</span></p>
      <div className="selector">
        {tables?.map((t) => {
          const fullName = `${t.schema}.${t.name}`;
          return (
            <button
              key={fullName}
              onClick={() => toggle(fullName)}
              className={`selector-item ${selected.includes(fullName) ? "selecionado" : ""}`}
            >
              <div>
                <b className="mono">{fullName}</b>
                {t.rowCount !== null && <><br /><small>~{t.rowCount} rows</small></>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
