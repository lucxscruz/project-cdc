import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestPgClient,
  getTestKafka,
  getTestMinioClient,
  waitForServices,
  listMinioObjects,
  SCHEMA_REGISTRY_URL,
} from "../setup.js";

describe("Pipeline CDC — PostgreSQL", () => {
  beforeAll(async () => {
    await waitForServices();
  });

  it("deve capturar INSERT no Postgres e entregar no tópico Redpanda", async () => {
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

    // Consumir do tópico pg.public.customers
    const kafka = getTestKafka();
    const consumer = kafka.consumer({ groupId: `test-pg-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({
      topic: "pg.public.customers",
      fromBeginning: true,
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

  it("deve ter schemas registrados no Schema Registry para tópicos PG", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    const subjects: string[] = await res.json();

    expect(subjects).toContain("pg.public.customers-value");
    expect(subjects).toContain("pg.public.customers-key");
  });

  it("deve ter objetos no MinIO para tópicos PG", async () => {
    const minio = getTestMinioClient();
    const result = await listMinioObjects(minio, "raw", "pg.public.customers/");

    expect(result.Contents).toBeDefined();
    expect(result.Contents!.length).toBeGreaterThan(0);
  });
});
