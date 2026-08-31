import pg from "pg";
import mysql from "mysql2/promise";
import { Kafka } from "kafkajs";
import {
  S3Client,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

// Endereços no host (fora do Docker)
export const PG_CONFIG = {
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "cdc_source",
};

export const MYSQL_CONFIG = {
  host: "localhost",
  port: 3307,
  user: "root",
  password: "root",
  database: "cdc_source",
};

export const KAFKA_BROKERS = ["localhost:9092"];
export const KAFKA_CONNECT_URL = "http://localhost:8083";
export const SCHEMA_REGISTRY_URL = "http://localhost:8081";
export const MINIO_ENDPOINT = "http://localhost:19000";
export const BFF_URL = "http://localhost:3001";

export function getTestPgClient(): pg.Client {
  return new pg.Client(PG_CONFIG);
}

export async function getTestMysqlConnection(): Promise<mysql.Connection> {
  return mysql.createConnection(MYSQL_CONFIG);
}

export function getTestKafka(): Kafka {
  return new Kafka({
    clientId: "integration-tests",
    brokers: KAFKA_BROKERS,
  });
}

export function getTestMinioClient(): S3Client {
  return new S3Client({
    endpoint: MINIO_ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
    forcePathStyle: true,
  });
}

export function getTestBffUrl(): string {
  return BFF_URL;
}

/**
 * Espera até que um serviço responda, com retry.
 */
export async function waitForService(
  name: string,
  checkFn: () => Promise<void>,
  maxRetries = 30,
  intervalMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await checkFn();
      return;
    } catch {
      if (i === maxRetries - 1) {
        throw new Error(
          `Serviço ${name} não ficou pronto após ${maxRetries * intervalMs / 1000}s`,
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

/**
 * Espera que todos os serviços necessários estejam prontos.
 */
export async function waitForServices(): Promise<void> {
  await waitForService("kafka-connect", async () => {
    const res = await fetch(`${KAFKA_CONNECT_URL}/connectors`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  await waitForService("bff", async () => {
    const res = await fetch(`${BFF_URL}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  await waitForService("schema-registry", async () => {
    const res = await fetch(`${SCHEMA_REGISTRY_URL}/subjects`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

/**
 * Lista objetos no bucket MinIO com prefixo.
 */
export async function listMinioObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<ListObjectsV2CommandOutput> {
  return client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
  );
}
