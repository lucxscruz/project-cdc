import { FastifyInstance } from "fastify";

const TRINO_URL = process.env.TRINO_URL ?? "http://trino:8085";

async function trinoQuery(sql: string): Promise<any[]> {
  const submitRes = await fetch(`${TRINO_URL}/v1/statement`, {
    method: "POST",
    headers: { "X-Trino-User": "bff", "X-Trino-Catalog": "iceberg", "X-Trino-Schema": "iceberg_db" },
    body: sql,
  });
  let result = await submitRes.json();
  const allData: any[] = [];

  // Accumulate data across poll responses
  if (result.data) allData.push(...result.data);

  while (result.nextUri) {
    await new Promise((r) => setTimeout(r, 500));
    const internalUri = result.nextUri.replace(/http:\/\/[^/]+/, TRINO_URL);
    const pollRes = await fetch(internalUri, {
      headers: { "X-Trino-User": "bff" },
    });
    result = await pollRes.json();
    if (result.data) allData.push(...result.data);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return allData;
}

async function trinoExecute(sql: string): Promise<void> {
  await trinoQuery(sql);
}

export async function lakehouseRoutes(app: FastifyInstance) {
  // List all Silver views
  app.get("/silver", async () => {
    try {
      await trinoExecute("CREATE SCHEMA IF NOT EXISTS iceberg.silver");
      const rows = await trinoQuery("SHOW TABLES FROM iceberg.silver");
      return rows.map((r: any[]) => r[0]);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  // Generate Silver view for a specific Bronze table
  app.post("/silver/generate", async (req, reply) => {
    const { table, idColumn } = req.body as { table: string; idColumn?: string };

    if (!table) {
      return reply.status(400).send({ error: "table is required" });
    }

    const pk = idColumn ?? "id";
    const silverView = table; // same name in silver schema

    try {
      // Ensure silver schema exists
      await trinoExecute("CREATE SCHEMA IF NOT EXISTS iceberg.silver");

      const columns = await trinoQuery(`SHOW COLUMNS FROM iceberg.iceberg_db.${table}`);
      const colNames = columns.map((r: any[]) => r[0]);
      const hasTs = colNames.includes("__source_ts_ms");
      const hasDeleted = colNames.includes("__deleted");
      const orderCol = hasTs ? "__source_ts_ms" : pk;

      const whereClause = hasDeleted
        ? "WHERE __rn = 1 AND (__deleted IS NULL OR __deleted != 'true')"
        : "WHERE __rn = 1";

      await trinoExecute(`
        CREATE OR REPLACE VIEW iceberg.silver.${silverView} AS
        SELECT * FROM (
          SELECT
            *,
            ROW_NUMBER() OVER (PARTITION BY ${pk} ORDER BY ${orderCol} DESC) AS __rn
          FROM iceberg.iceberg_db.${table}
        )
        ${whereClause}
      `);

      return { view: `iceberg.silver.${silverView}`, source: `iceberg.iceberg_db.${table}`, idColumn: pk };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Generate Silver views for ALL Bronze tables automatically
  app.post("/silver/generate-all", async (_req, reply) => {
    try {
      await trinoExecute("CREATE SCHEMA IF NOT EXISTS iceberg.silver");

      // List all Bronze tables
      const tables = await trinoQuery("SHOW TABLES FROM iceberg.iceberg_db");
      const tableNames = tables.map((r: any[]) => r[0]);

      const results: Array<{ table: string; view: string; status: string }> = [];

      for (const table of tableNames) {
        try {
          const columns = await trinoQuery(`SHOW COLUMNS FROM iceberg.iceberg_db.${table}`);
          const colNames = columns.map((r: any[]) => r[0]);
          const pk = colNames.includes("id") ? "id" : colNames[0];
          const hasTs = colNames.includes("__source_ts_ms");
          const hasDeleted = colNames.includes("__deleted");
          const orderCol = hasTs ? "__source_ts_ms" : pk;

          const whereClause = hasDeleted
            ? "WHERE __rn = 1 AND (__deleted IS NULL OR __deleted != 'true')"
            : "WHERE __rn = 1";

          await trinoExecute(`
            CREATE OR REPLACE VIEW iceberg.silver.${table} AS
            SELECT * FROM (
              SELECT
                *,
                ROW_NUMBER() OVER (PARTITION BY ${pk} ORDER BY ${orderCol} DESC) AS __rn
              FROM iceberg.iceberg_db.${table}
            )
            ${whereClause}
          `);

          results.push({ table, view: `iceberg.silver.${table}`, status: "ok" });
        } catch (err: any) {
          results.push({ table, view: "", status: `error: ${err.message}` });
        }
      }

      return results;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
