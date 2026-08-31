import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Health", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/health deve retornar status dos serviços", async () => {
    const res = await fetch(`${bffUrl}/api/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.services).toHaveProperty("postgres");
    expect(body.services).toHaveProperty("mysql");
    expect(body.services).toHaveProperty("kafka");
    expect(body.services).toHaveProperty("kafka-connect");
    expect(body.services).toHaveProperty("minio");
    expect(body.services).toHaveProperty("schema-registry");

    for (const service of Object.values(body.services) as any[]) {
      expect(service.status).toBe("up");
      expect(service.latencyMs).toBeTypeOf("number");
    }
  });

  it("GET /api/health/postgres deve retornar status individual", async () => {
    const res = await fetch(`${bffUrl}/api/health/postgres`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("up");
    expect(body.latencyMs).toBeTypeOf("number");
  });

  it("GET /api/health/unknown deve retornar 404", async () => {
    const res = await fetch(`${bffUrl}/api/health/unknown`);

    expect(res.status).toBe(404);
  });
});
