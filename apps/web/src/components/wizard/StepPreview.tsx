interface StepPreviewProps {
  config: { name: string; config: Record<string, string> } | null;
  isLoading: boolean;
}

export function StepPreview({ config, isLoading }: StepPreviewProps) {
  if (isLoading) return <p className="text-gray-500">Generating config...</p>;
  if (!config) return <p className="text-gray-500">No config generated</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Review Configuration</h3>
      <p className="text-sm text-gray-500">
        Connector: <span className="font-medium text-gray-900">{config.name}</span>
      </p>
      <pre className="text-xs bg-gray-50 p-4 rounded-lg border overflow-auto max-h-96">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  );
}
