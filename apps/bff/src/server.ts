import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { connectorRoutes } from "./routes/connectors.js";
import { metricsPlugin } from "./plugins/metrics.js";
import { createHealthChecker } from "./services/health-checker.js";
import { createKafkaConnectClient } from "./services/kafka-connect-client.js";

declare module "fastify" {
  interface FastifyInstance {
    healthChecker: import("./services/health-checker.js").HealthChecker;
    kafkaConnectClient: import("./services/kafka-connect-client.js").KafkaConnectClient;
    metricsGauges: {
      health: import("prom-client").Gauge;
      connector: import("prom-client").Gauge;
    };
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  app.decorate("healthChecker", createHealthChecker());
  app.decorate("kafkaConnectClient", createKafkaConnectClient());
  await app.register(metricsPlugin);
  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(connectorRoutes, { prefix: "/api/connectors" });

  return app;
}

async function start() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
}

start();
