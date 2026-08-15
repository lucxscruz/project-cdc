const BASE_URL = "/api";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: {
    getAll: () => request<{
      status: string;
      services: Record<string, { status: string; latencyMs: number }>;
    }>("/health"),
  },

  connectors: {
    list: () => request<Array<{
      name: string;
      type: string;
      state: string;
      tasks: Array<{ id: number; state: string }>;
    }>>("/connectors"),
    get: (name: string) => request<{
      name: string;
      type: string;
      state: string;
      config: Record<string, string>;
      tasks: Array<{ id: number; state: string; workerId: string }>;
    }>(`/connectors/${name}`),
    create: (body: { name: string; config: Record<string, string> }) =>
      request("/connectors", { method: "POST", body: JSON.stringify(body) }),
    update: (name: string, config: Record<string, string>) =>
      request(`/connectors/${name}`, { method: "PUT", body: JSON.stringify(config) }),
    remove: (name: string) =>
      request(`/connectors/${name}`, { method: "DELETE" }),
    restart: (name: string) =>
      request(`/connectors/${name}/restart`, { method: "POST" }),
    pause: (name: string) =>
      request(`/connectors/${name}/pause`, { method: "POST" }),
    resume: (name: string) =>
      request(`/connectors/${name}/resume`, { method: "POST" }),
  },

  databases: {
    list: () => request<Array<{ name: string; type: string }>>("/databases"),
    tables: (db: string) =>
      request<Array<{ name: string; schema: string; rowCount: number | null }>>(
        `/databases/${db}/tables`
      ),
    columns: (db: string, table: string) =>
      request<Array<{ name: string; type: string; nullable: boolean; isPrimaryKey: boolean }>>(
        `/databases/${db}/tables/${table}/columns`
      ),
    preview: (db: string, table: string) =>
      request<{ columns: string[]; rows: Record<string, unknown>[] }>(
        `/databases/${db}/tables/${table}/preview`
      ),
  },

  templates: {
    list: () => request<Array<{ id: string; name: string; type: string }>>("/templates"),
    generate: (body: {
      templateId: string;
      database: string;
      tables: string[];
      options?: { snapshotMode?: string; topicPrefix?: string; connectorName?: string };
    }) =>
      request<{ name: string; config: Record<string, string> }>("/templates/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
};
