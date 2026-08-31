import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Templates", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/templates deve listar os 3 templates", async () => {
    const res = await fetch(`${bffUrl}/api/templates`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(3);

    const ids = body.map((t: any) => t.id);
    expect(ids).toContain("debezium-postgres");
    expect(ids).toContain("debezium-mysql");
    expect(ids).toContain("s3-sink-minio");
  });

  it("POST /api/templates/generate deve gerar config de connector PG", async () => {
    const res = await fetch(`${bffUrl}/api/templates/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "debezium-postgres",
        database: "postgres",
        tables: ["public.customers"],
        options: { connectorName: "test-pg-gen" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("test-pg-gen");
    expect(body.config["connector.class"]).toBe(
      "io.debezium.connector.postgresql.PostgresConnector",
    );
    expect(body.config["table.include.list"]).toBe("public.customers");
  });

  it("POST /api/templates/generate deve gerar config de S3 sink", async () => {
    const res = await fetch(`${bffUrl}/api/templates/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "s3-sink-minio",
        database: "postgres",
        tables: ["public.customers"],
        options: { connectorName: "test-s3-gen", topicPrefix: "pg" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("test-s3-gen");
    expect(body.config["connector.class"]).toBe(
      "io.confluent.connect.s3.S3SinkConnector",
    );
    expect(body.config["s3.bucket.name"]).toBe("raw");
  });
});
