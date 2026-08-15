interface StatusCardProps {
  label: string;
  count: number;
  color: "green" | "yellow" | "red" | "gray";
}

const colorMap = {
  green: "bg-green-100 text-green-800 border-green-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  red: "bg-red-100 text-red-800 border-red-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
};

export function StatusCard({ label, count, color }: StatusCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{count}</p>
    </div>
  );
}
