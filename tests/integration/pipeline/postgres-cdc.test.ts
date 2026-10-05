import { describe, it, expect, beforeAll } from "vitest";
import {
  getTestPgClient,
  getTestKafka,
  getTestMinioClient,
  waitForServices,
  listMinioObjects,
  SCHEMA_REGISTRY_URL,
  TRINO_URL,
} from "../setup.js";

describe("Pipeline CDC — PostgreSQL", () => {
  beforeAll(async () => {
    await waitForServices();
  });

  it("deve capturar INSERT no Postgres e entregar no tópico Avro", async () => {
    const uniqueName = `test-user-${Date.now()}`;
    const pgClient = getTestPgClient();
    await pgClient.connect();

    try {
      await pgClient.query(
        "INSERT INTO customers (name, email) VALUES ($1, $2)",
        [uniqueName, `${uniqueName}@test.com`],
      );
    } finally {
      await pgClient.end();
    }

    // Consumir do tópico Avro (source principal)
    const kafka = getTestKafka();
    const consumer = kafka.consumer({ groupId: `test-pg-avro-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({
      topic: "pg.public.customers",
      fromBeginning: false,
    });

    const found = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 20_000);

      consumer.run({
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (value && value.includes(uniqueName)) {
            clearTimeout(timeout);
            resolve(true);
          }
        },
      });
    });

    await consumer.disconnect();
    expect(found).toBe(true);
  });

  it("deve capturar INSERT no tópico JSON flat (pg-iceberg)", async () => {
    const uniqueName = `test-iceberg-${Date.now()}`;
    const pgClient = getTestPgClient();
    await pgClient.connect();

    try {
      await pgClient.query(
        "INSERT INTO customers (name, email) VALUES ($1, $2)",
        [uniqueName, `${uniqueName}@test.com`],
      );
    } finally {
      await pgClient.end();
    }

    // Consumir do tópico JSON flat (source iceberg)
    const kafka = getTestKafka();
    const consumer = kafka.consumer({ groupId: `test-pg-iceberg-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({
      topic: "pg-iceberg.public.customers",
      fromBeginning: false,
    });

    const found = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 20_000);

      consumer.run({
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (value && value.includes(uniqueName)) {
            clearTimeout(timeout);
            // Verificar que é JSON flat (sem envelope Debezium)
            const parsed = JSON.parse(value);
            expect(parsed).toHaveProperty("id");
            expect(parsed).toHaveProperty("name", uniqueName);
            expect(parsed).not.toHaveProperty("before");
            expect(parsed).not.toHaveProperty("after");
            expect(parsed).not.toHaveProperty("op");
            resolve(true);
          }
        },
      });
    });

    await consumer.disconnect();
    expect(found).toBe(true);
  });

  it("deve ter schemas registrados no Schema Registry para tópicos PG", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    const subjects: string[] = await res.json();

    expect(subjects).toContain("pg.public.customers-value");
    expect(subjects).toContain("pg.public.customers-key");
  });

  it("deve ter objetos Iceberg no MinIO warehouse", async () => {
    const minio = getTestMinioClient();
    const result = await listMinioObjects(
      minio,
      "warehouse",
      "bronze/pg_customers/",
    );

    expect(result.Contents).toBeDefined();
    expect(result.Contents!.length).toBeGreaterThan(0);
  });

  it("deve ter tabelas Iceberg acessíveis via Trino", async () => {
    const res = await fetch(`${TRINO_URL}/v1/statement`, {
      method: "POST",
      headers: { "X-Trino-User": "test" },
      body: "SHOW TABLES FROM iceberg.bronze",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Trino retorna nextUri para polling dos resultados
    expect(body.nextUri || body.data).toBeDefined();
  });
});
