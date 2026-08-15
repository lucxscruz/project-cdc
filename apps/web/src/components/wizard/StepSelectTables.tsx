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

  if (isLoading) return <p className="text-gray-500">Loading tables...</p>;

  const toggle = (fullName: string) => {
    onChange(
      selected.includes(fullName)
        ? selected.filter((t) => t !== fullName)
        : [...selected, fullName]
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Select Tables</h3>
      <p className="text-sm text-gray-500">Database: {database}</p>
      <div className="space-y-2">
        {tables?.map((t) => {
          const fullName = `${t.schema}.${t.name}`;
          return (
            <label
              key={fullName}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                selected.includes(fullName) ? "border-gray-900 bg-gray-50" : "border-gray-200"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(fullName)}
                onChange={() => toggle(fullName)}
                className="rounded"
              />
              <div>
                <p className="text-sm font-medium">{fullName}</p>
                <p className="text-xs text-gray-400">
                  {t.rowCount !== null ? `~${t.rowCount} rows` : ""}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
