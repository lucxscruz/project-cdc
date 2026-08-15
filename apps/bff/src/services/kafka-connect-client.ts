import { config } from "../config.js";

export interface ConnectorSummary {
  name: string;
  type: string;
  state: string;
  workerId: string;
  tasks: { id: number; state: string; workerId: string }[];
}

export interface ConnectorDetail extends ConnectorSummary {
  config: Record<string, string>;
}

export interface CreateConnectorRequest {
  name: string;
  config: Record<string, string>;
}

export interface KafkaConnectClient {
  list(): Promise<ConnectorSummary[]>;
  get(name: string): Promise<ConnectorDetail>;
  create(body: CreateConnectorRequest): Promise<{ name: string }>;
  update(name: string, config: Record<string, string>): Promise<Record<string, string>>;
  remove(name: string): Promise<void>;
  restart(name: string): Promise<void>;
  pause(name: string): Promise<void>;
  resume(name: string): Promise<void>;
}

export function createKafkaConnectClient(): KafkaConnectClient {
  const baseUrl = config.kafkaConnect.url;

  async function request(path: string, opts?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Kafka Connect ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined;
    return res.json();
  }

  return {
    async list(): Promise<ConnectorSummary[]> {
      const data = await request("/connectors?expand=status&expand=info");
      return Object.entries(data).map(([name, value]: [string, any]) => ({
        name,
        type: value.info?.type ?? "unknown",
        state: value.status?.connector?.state ?? "UNKNOWN",
        workerId: value.status?.connector?.worker_id ?? "",
        tasks: (value.status?.tasks ?? []).map((t: any) => ({
          id: t.id,
          state: t.state,
          workerId: t.worker_id,
        })),
      }));
    },

    async get(name: string): Promise<ConnectorDetail> {
      const [statusRes, configRes] = await Promise.all([
        request(`/connectors/${name}/status`),
        request(`/connectors/${name}/config`),
      ]);
      return {
        name: statusRes.name,
        type: statusRes.type,
        state: statusRes.connector.state,
        workerId: statusRes.connector.worker_id,
        config: configRes,
        tasks: statusRes.tasks.map((t: any) => ({
          id: t.id,
          state: t.state,
          workerId: t.worker_id,
        })),
      };
    },

    async create(body: CreateConnectorRequest) {
      return request("/connectors", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async update(name: string, cfg: Record<string, string>) {
      return request(`/connectors/${name}/config`, {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
    },

    async remove(name: string) {
      await request(`/connectors/${name}`, { method: "DELETE" });
    },

    async restart(name: string) {
      await request(`/connectors/${name}/restart`, { method: "POST" });
    },

    async pause(name: string) {
      await request(`/connectors/${name}/pause`, { method: "PUT" });
    },

    async resume(name: string) {
      await request(`/connectors/${name}/resume`, { method: "PUT" });
    },
  };
}
