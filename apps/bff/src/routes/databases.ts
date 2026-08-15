import { FastifyInstance } from "fastify";

export async function databaseRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return app.databaseClient.listDatabases();
  });

  app.get("/:db/tables", async (req) => {
    const { db } = req.params as { db: string };
    return app.databaseClient.listTables(db);
  });

  app.get("/:db/tables/:table/columns", async (req) => {
    const { db, table } = req.params as { db: string; table: string };
    return app.databaseClient.listColumns(db, table);
  });

  app.get("/:db/tables/:table/preview", async (req) => {
    const { db, table } = req.params as { db: string; table: string };
    return app.databaseClient.preview(db, table);
  });
}
