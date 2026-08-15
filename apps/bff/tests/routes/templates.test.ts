import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { templateRoutes } from "../../src/routes/templates.js";
import { TemplateEngine } from "../../src/services/template-engine.js";

function buildMockEngine(): TemplateEngine {
  return {
    listTemplates: vi.fn().mockReturnValue([
      { id: "debezium-postgres", name: "Debezium PostgreSQL Source", type: "source" },
      { id: "debezium-mysql", name: "Debezium MySQL Source", type: "source" },
      { id: "s3-sink-minio", name: "S3 Sink (MinIO)", type: "sink" },
    ]),
    generate: vi.fn().mockReturnValue({
      name: "pg-customers-source",
      config: {
        "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
        "database.hostname": "postgres",
        "table.include.list": "public.customers",
      },
    }),
  };
}

describe("GET /api/templates", () => {
  it("returns available templates", async () => {
    const app = Fastify();
    app.decorate("templateEngine", buildMockEngine());
    await app.register(templateRoutes, { prefix: "/api/templates" });

    const res = await app.inject({ method: "GET", url: "/api/templates" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
  });
});

describe("POST /api/templates/generate", () => {
  it("generates connector config from template", async () => {
    const app = Fastify();
    const engine = buildMockEngine();
    app.decorate("templateEngine", engine);
    await app.register(templateRoutes, { prefix: "/api/templates" });

    const res = await app.inject({
      method: "POST",
      url: "/api/templates/generate",
      payload: {
        templateId: "debezium-postgres",
        database: "postgres",
        tables: ["public.customers"],
        options: { snapshotMode: "initial", topicPrefix: "pg" },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("pg-customers-source");
    expect(res.json().config["connector.class"]).toContain("PostgresConnector");
  });
});
