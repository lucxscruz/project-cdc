import { FastifyInstance } from "fastify";
import client from "prom-client";

export async function metricsPlugin(app: FastifyInstance) {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpDuration = new client.Histogram({
    name: "bff_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [register],
  });

  const healthGauge = new client.Gauge({
    name: "bff_health_check_status",
    help: "Health check status per service (1=up, 0=down)",
    labelNames: ["service"],
    registers: [register],
  });

  const connectorGauge = new client.Gauge({
    name: "bff_connector_status",
    help: "Connector status (1=running, 0.5=paused, 0=failed)",
    labelNames: ["connector"],
    registers: [register],
  });

  const errorCounter = new client.Counter({
    name: "bff_api_errors_total",
    help: "Total API errors",
    labelNames: ["method", "route"],
    registers: [register],
  });

  app.addHook("onResponse", (req, reply, done) => {
    const route = req.routeOptions?.url ?? req.url;
    if (route !== "/metrics") {
      httpDuration.observe(
        {
          method: req.method,
          route,
          status_code: reply.statusCode.toString(),
        },
        reply.elapsedTime / 1000
      );
      if (reply.statusCode >= 400) {
        errorCounter.inc({ method: req.method, route });
      }
    }
    done();
  });

  app.decorate("metricsGauges", {
    health: healthGauge,
    connector: connectorGauge,
  });

  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });
}
