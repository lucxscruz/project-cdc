import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Connectors", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/connectors deve listar connectors registrados", async () => {
    const res = await fetch(`${bffUrl}/api/connectors`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const names = body.map((c: any) => c.name);
    expect(names).toContain("postgres-source");
  });

  it("GET /api/connectors/:name deve retornar detalhes", async () => {
    const res = await fetch(`${bffUrl}/api/connectors/postgres-source`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("postgres-source");
    expect(body.config).toBeDefined();
    expect(body.tasks).toBeDefined();
    expect(body.state).toBeDefined();
  });

  it("deve suportar pause e resume de connector", async () => {
    // Pause
    const pauseRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source/pause`,
      { method: "POST" },
    );
    expect(pauseRes.status).toBe(204);

    // Esperar propagação
    await new Promise((r) => setTimeout(r, 2000));

    // Verificar estado PAUSED
    const statusRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source`,
    );
    const statusBody = await statusRes.json();
    expect(statusBody.state).toBe("PAUSED");

    // Resume
    const resumeRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source/resume`,
      { method: "POST" },
    );
    expect(resumeRes.status).toBe(204);

    // Esperar propagação
    await new Promise((r) => setTimeout(r, 2000));

    // Verificar estado RUNNING
    const finalRes = await fetch(
      `${bffUrl}/api/connectors/postgres-source`,
    );
    const finalBody = await finalRes.json();
    expect(finalBody.state).toBe("RUNNING");
  });
});
