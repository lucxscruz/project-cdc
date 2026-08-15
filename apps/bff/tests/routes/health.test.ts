import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../../src/routes/health.js";
import { HealthChecker } from "../../src/services/health-checker.js";

describe("GET /api/health", () => {
  const mockChecker: HealthChecker = {
    checkAll: vi.fn().mockResolvedValue({
      postgres: { status: "up", latencyMs: 5 },
      mysql: { status: "up", latencyMs: 3 },
      kafka: { status: "up", latencyMs: 10 },
      "kafka-connect": { status: "up", latencyMs: 8 },
      minio: { status: "up", latencyMs: 4 },
      "schema-registry": { status: "up", latencyMs: 6 },
    }),
    checkService: vi.fn().mockResolvedValue({ status: "up", latencyMs: 5 }),
  };

  it("returns aggregated health status", async () => {
    const app = Fastify();
    app.decorate("healthChecker", mockChecker);
    await app.register(healthRoutes, { prefix: "/api/health" });

    const res = await app.inject({ method: "GET", url: "/api/health" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.services.postgres.status).toBe("up");
    expect(body.services.kafka.status).toBe("up");
  });

  it("returns individual service health", async () => {
    const app = Fastify();
    app.decorate("healthChecker", mockChecker);
    await app.register(healthRoutes, { prefix: "/api/health" });

    const res = await app.inject({
      method: "GET",
      url: "/api/health/postgres",
    });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("up");
    expect(body.latencyMs).toBeTypeOf("number");
  });

  it("returns 404 for unknown service", async () => {
    (mockChecker.checkService as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Unknown service: unknown")
    );
    const app = Fastify();
    app.decorate("healthChecker", mockChecker);
    await app.register(healthRoutes, { prefix: "/api/health" });

    const res = await app.inject({
      method: "GET",
      url: "/api/health/unknown",
    });

    expect(res.statusCode).toBe(404);
  });
});
