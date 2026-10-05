import { FastifyInstance } from "fastify";
import pg from "pg";
import { config } from "../config.js";
import { randomUUID } from "crypto";

export async function connectorRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.kafkaConnectClient.list();
  });

  app.get("/:name", async (req) => {
    const { name } = req.params as { name: string };
    return app.kafkaConnectClient.get(name);
  });

  app.post("/", async (req, reply) => {
    const body = req.body as { name: string; config: Record<string, string> };
    const result = await app.kafkaConnectClient.create(body);
    return reply.status(201).send(result);
  });

  app.put("/:name", async (req) => {
    const { name } = req.params as { name: string };
    const cfg = req.body as Record<string, string>;
    return app.kafkaConnectClient.update(name, cfg);
  });

  app.delete("/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.remove(name);
    return reply.status(204).send();
  });

  app.post("/:name/restart", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.restart(name);
    return reply.status(204).send();
  });

  app.post("/:name/pause", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.pause(name);
    return reply.status(204).send();
  });

  app.post("/:name/resume", async (req, reply) => {
    const { name } = req.params as { name: string };
    await app.kafkaConnectClient.resume(name);
    return reply.status(204).send();
  });

  app.post("/:name/snapshot", async (req, reply) => {
    const { name } = req.params as { name: string };
    const { table } = req.body as { table: string };

    if (!table) {
      return reply.status(400).send({ error: "table is required" });
    }

    const client = new pg.Client(config.postgres);
    await client.connect();
    try {
      await client.query(
        `INSERT INTO debezium_signal (id, type, data) VALUES ($1, $2, $3)`,
        [
          randomUUID(),
          "execute-snapshot",
          JSON.stringify({ "data-collections": [table] }),
        ],
      );
    } finally {
      await client.end();
    }

    return reply.status(202).send({ message: `Snapshot triggered for ${table}` });
  });
}
