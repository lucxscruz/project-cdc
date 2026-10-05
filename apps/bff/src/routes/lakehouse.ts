import { FastifyInstance } from "fastify";

const TRINO_URL = process.env.TRINO_URL ?? "http://trino:8085";
const KAFKA_CONNECT_URL = process.env.KAFKA_CONNECT_URL ?? "http://kafka-connect:8083";
const CDC_META_COLUMNS = new Set(["__deleted", "__op", "__source_ts_ms"]);

async function trinoQuery(sql: string): Promise<any[]> {
  const submitRes = await fetch(`${TRINO_URL}/v1/statement`, {
    method: "POST",
    headers: { "X-Trino-User": "bff", "X-Trino-Catalog": "iceberg", "X-Trino-Schema": "bronze" },
    body: sql,
  });
  let result = await submitRes.json();
  const allData: any[] = [];

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

function buildSilverViewSQL(
  table: string,
  colNames: string[],
  pk: string,
): string {
  const hasTs = colNames.includes("__source_ts_ms");
  const hasDeleted = colNames.includes("__deleted");
  const orderCol = hasTs ? "__source_ts_ms" : pk;

  // Only include original table columns (exclude CDC metadata)
  const cleanColumns = colNames
    .filter((c) => !CDC_META_COLUMNS.has(c))
    .map((c) => `"${c}"`)
    .join(", ");

  const deleteFilter = hasDeleted
    ? "AND (__deleted IS NULL OR __deleted != 'true')"
    : "";

  return `
    CREATE OR REPLACE VIEW iceberg.silver.${table} AS
    SELECT ${cleanColumns} FROM (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY ${pk} ORDER BY ${orderCol} DESC) AS __rn
      FROM iceberg.bronze.${table}
    )
    WHERE __rn = 1 ${deleteFilter}
  `;
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

    try {
      await trinoExecute("CREATE SCHEMA IF NOT EXISTS iceberg.silver");

      const columns = await trinoQuery(`SHOW COLUMNS FROM iceberg.bronze.${table}`);
      const colNames = columns.map((r: any[]) => r[0]);

      await trinoExecute(buildSilverViewSQL(table, colNames, pk));

      return { view: `iceberg.silver.${table}`, source: `iceberg.bronze.${table}`, idColumn: pk };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Generate Silver views for ALL Bronze tables automatically
  app.post("/silver/generate-all", async (_req, reply) => {
    try {
      await trinoExecute("CREATE SCHEMA IF NOT EXISTS iceberg.silver");

      const tables = await trinoQuery("SHOW TABLES FROM iceberg.bronze");
      const tableNames = tables.map((r: any[]) => r[0]);

      const results: Array<{ table: string; view: string; status: string }> = [];

      // Load PK from sink connector configs
      const sinkPkMap = new Map<string, string>();
      try {
        const connectRes = await fetch(`${KAFKA_CONNECT_URL}/connectors`);
        const connectorNames: string[] = await connectRes.json();
        for (const name of connectorNames.filter((n) => n.startsWith("iceberg-sink-"))) {
          const cfgRes = await fetch(`${KAFKA_CONNECT_URL}/connectors/${name}/config`);
          const cfg = await cfgRes.json();
          if (cfg["cdc.primary.key"] && cfg["iceberg.tables"]) {
            const bronzeTable = cfg["iceberg.tables"].replace("bronze.", "");
            sinkPkMap.set(bronzeTable, cfg["cdc.primary.key"]);
          }
        }
      } catch { /* ignore — will fallback to id */ }

      for (const table of tableNames) {
        try {
          const columns = await trinoQuery(`SHOW COLUMNS FROM iceberg.bronze.${table}`);
          const colNames = columns.map((r: any[]) => r[0]);
          const pk = sinkPkMap.get(table) ?? (colNames.includes("id") ? "id" : colNames[0]);

          await trinoExecute(buildSilverViewSQL(table, colNames, pk));

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
