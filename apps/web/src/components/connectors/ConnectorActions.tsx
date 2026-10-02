import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ConnectorActionsProps {
  name: string;
  state: string;
}

export function ConnectorActions({ name, state }: ConnectorActionsProps) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["connectors"] });
    queryClient.invalidateQueries({ queryKey: ["connector", name] });
  };

  const pause = useMutation({ mutationFn: () => api.connectors.pause(name), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => api.connectors.resume(name), onSuccess: invalidate });
  const restart = useMutation({ mutationFn: () => api.connectors.restart(name), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.connectors.remove(name), onSuccess: invalidate });

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {state === "RUNNING" && (
        <button className="acao warn" onClick={() => pause.mutate()}>Pause</button>
      )}
      {state === "PAUSED" && (
        <button className="acao ok" onClick={() => resume.mutate()}>Resume</button>
      )}
      <button className="acao" onClick={() => restart.mutate()}>Restart</button>
      <button className="acao err" onClick={() => { if (confirm(`Delete connector "${name}"?`)) remove.mutate(); }}>Delete</button>
    </div>
  );
}
