import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { connectorRoutes } from "./routes/connectors.js";
import { databaseRoutes } from "./routes/databases.js";
import { templateRoutes } from "./routes/templates.js";
import { metricsPlugin } from "./plugins/metrics.js";
import { createHealthChecker } from "./services/health-checker.js";
import { createKafkaConnectClient } from "./services/kafka-connect-client.js";
import { createDatabaseClient } from "./services/database-client.js";
import { createTemplateEngine } from "./services/template-engine.js";

declare module "fastify" {
  interface FastifyInstance {
    healthChecker: import("./services/health-checker.js").HealthChecker;
    kafkaConnectClient: import("./services/kafka-connect-client.js").KafkaConnectClient;
    databaseClient: import("./services/database-client.js").DatabaseClient;
    templateEngine: import("./services/template-engine.js").TemplateEngine;
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
  app.decorate("databaseClient", createDatabaseClient());
  app.decorate("templateEngine", createTemplateEngine());
  await app.register(metricsPlugin);
  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(connectorRoutes, { prefix: "/api/connectors" });
  await app.register(databaseRoutes, { prefix: "/api/databases" });
  await app.register(templateRoutes, { prefix: "/api/templates" });

  return app;
}

async function start() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
}

start();
