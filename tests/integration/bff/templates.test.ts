import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Templates", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/templates deve listar os templates disponíveis", async () => {
    const res = await fetch(`${bffUrl}/api/templates`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(3);

    const ids = body.map((t: any) => t.id);
    expect(ids).toContain("debezium-postgres");
    expect(ids).toContain("debezium-mysql");
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

  it("POST /api/templates/generate deve gerar config de connector MySQL", async () => {
    const res = await fetch(`${bffUrl}/api/templates/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "debezium-mysql",
        database: "mysql",
        tables: ["cdc_source.employees"],
        options: { connectorName: "test-mysql-gen" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("test-mysql-gen");
    expect(body.config["connector.class"]).toBe(
      "io.debezium.connector.mysql.MySqlConnector",
    );
  });
});
