import { FastifyInstance } from "fastify";
import { GenerateRequest } from "../services/template-engine.js";

export async function templateRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.templateEngine.listTemplates();
  });

  app.post("/generate", async (req) => {
    const body = req.body as GenerateRequest;
    return app.templateEngine.generate(body);
  });
}
