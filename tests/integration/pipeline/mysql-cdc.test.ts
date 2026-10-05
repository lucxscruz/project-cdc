import { describe, it, expect, beforeAll } from "vitest";
import {
  getTestMysqlConnection,
  getTestKafka,
  getTestMinioClient,
  waitForServices,
  listMinioObjects,
  SCHEMA_REGISTRY_URL,
} from "../setup.js";

describe("Pipeline CDC — MySQL", () => {
  beforeAll(async () => {
    await waitForServices();
  });

  it("deve capturar INSERT no MySQL e entregar no tópico Redpanda", async () => {
    const uniqueName = `test-emp-${Date.now()}`;
    const conn = await getTestMysqlConnection();

    try {
      await conn.execute(
        "INSERT INTO employees (name, department, salary) VALUES (?, ?, ?)",
        [uniqueName, "Engineering", 15000.0],
      );
    } finally {
      await conn.end();
    }

    // Consumir do tópico mysql.cdc_source.employees
    const kafka = getTestKafka();
    const consumer = kafka.consumer({ groupId: `test-mysql-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({
      topic: "mysql.cdc_source.employees",
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

  it("deve ter schemas registrados no Schema Registry para tópicos MySQL", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    const subjects: string[] = await res.json();

    expect(subjects).toContain("mysql.cdc_source.employees-value");
    expect(subjects).toContain("mysql.cdc_source.employees-key");
  });

  it("deve ter objetos Iceberg no MinIO warehouse para MySQL", async () => {
    const minio = getTestMinioClient();
    const result = await listMinioObjects(
      minio,
      "warehouse",
      "bronze/mysql_employees/",
    );

    expect(result.Contents).toBeDefined();
    expect(result.Contents!.length).toBeGreaterThan(0);
  });
});
