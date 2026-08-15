import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    const services = await app.healthChecker.checkAll();
    const allUp = Object.values(services).every(
      (s) => s.status === "up"
    );
    const status = allUp ? "healthy" : "degraded";
    const statusCode = allUp ? 200 : 503;

    return reply.status(statusCode).send({ status, services });
  });

  app.get("/:service", async (req, reply) => {
    const { service } = req.params as { service: string };
    try {
      const result = await app.healthChecker.checkService(service);
      return reply.send(result);
    } catch (err) {
      return reply
        .status(404)
        .send({ error: (err as Error).message });
    }
  });
}
