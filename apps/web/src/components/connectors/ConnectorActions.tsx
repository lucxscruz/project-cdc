import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ConnectorActionsProps {
  name: string;
  state: string;
}

export function ConnectorActions({ name, state }: ConnectorActionsProps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["connectors"] });

  const pause = useMutation({ mutationFn: () => api.connectors.pause(name), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => api.connectors.resume(name), onSuccess: invalidate });
  const restart = useMutation({ mutationFn: () => api.connectors.restart(name), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.connectors.remove(name), onSuccess: invalidate });

  return (
    <div className="flex gap-2">
      {state === "RUNNING" && (
        <button
          onClick={() => pause.mutate()}
          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
        >
          Pause
        </button>
      )}
      {state === "PAUSED" && (
        <button
          onClick={() => resume.mutate()}
          className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200"
        >
          Resume
        </button>
      )}
      <button
        onClick={() => restart.mutate()}
        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
      >
        Restart
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete connector "${name}"?`)) remove.mutate();
        }}
        className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
      >
        Delete
      </button>
    </div>
  );
}
