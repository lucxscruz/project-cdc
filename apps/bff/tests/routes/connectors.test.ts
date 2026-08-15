import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { connectorRoutes } from "../../src/routes/connectors.js";
import { KafkaConnectClient } from "../../src/services/kafka-connect-client.js";

function buildMockClient(): KafkaConnectClient {
  return {
    list: vi.fn().mockResolvedValue([
      {
        name: "postgres-source",
        type: "source",
        state: "RUNNING",
        workerId: "connect:8083",
        tasks: [{ id: 0, state: "RUNNING", workerId: "connect:8083" }],
      },
    ]),
    get: vi.fn().mockResolvedValue({
      name: "postgres-source",
      type: "source",
      state: "RUNNING",
      config: { "connector.class": "io.debezium.connector.postgresql.PostgresConnector" },
      tasks: [{ id: 0, state: "RUNNING", workerId: "connect:8083" }],
    }),
    create: vi.fn().mockResolvedValue({ name: "new-connector" }),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  };
}

describe("GET /api/connectors", () => {
  it("returns list of connectors with status", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({ method: "GET", url: "/api/connectors" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("postgres-source");
    expect(body[0].state).toBe("RUNNING");
  });
});

describe("GET /api/connectors/:name", () => {
  it("returns connector detail", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({ method: "GET", url: "/api/connectors/postgres-source" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.name).toBe("postgres-source");
    expect(body.config).toBeDefined();
    expect(body.tasks).toHaveLength(1);
  });
});

describe("POST /api/connectors", () => {
  it("creates a connector", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({
      method: "POST",
      url: "/api/connectors",
      payload: { name: "new-connector", config: { "connector.class": "test" } },
    });

    expect(res.statusCode).toBe(201);
    expect(client.create).toHaveBeenCalledWith({
      name: "new-connector",
      config: { "connector.class": "test" },
    });
  });
});

describe("DELETE /api/connectors/:name", () => {
  it("deletes a connector", async () => {
    const app = Fastify();
    const client = buildMockClient();
    app.decorate("kafkaConnectClient", client);
    await app.register(connectorRoutes, { prefix: "/api/connectors" });

    const res = await app.inject({ method: "DELETE", url: "/api/connectors/postgres-source" });

    expect(res.statusCode).toBe(204);
    expect(client.remove).toHaveBeenCalledWith("postgres-source");
  });
});
