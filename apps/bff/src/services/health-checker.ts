import pg from "pg";
import mysql from "mysql2/promise";
import { config } from "../config.js";

export interface ServiceHealth {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface HealthChecker {
  checkAll(): Promise<Record<string, ServiceHealth>>;
  checkService(name: string): Promise<ServiceHealth>;
}

const VALID_SERVICES = [
  "postgres",
  "mysql",
  "kafka",
  "kafka-connect",
  "minio",
  "schema-registry",
] as const;

type ServiceName = (typeof VALID_SERVICES)[number];

async function timed(
  fn: () => Promise<void>
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await fn();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

const checks: Record<ServiceName, () => Promise<void>> = {
  async postgres() {
    const client = new pg.Client(config.postgres);
    try {
      await client.connect();
      await client.query("SELECT 1");
    } finally {
      await client.end();
    }
  },

  async mysql() {
    const conn = await mysql.createConnection(config.mysql);
    try {
      await conn.query("SELECT 1");
    } finally {
      await conn.end();
    }
  },

  async kafka() {
    const res = await fetch(
      `${config.kafkaConnect.url}/connectors`
    );
    if (!res.ok) throw new Error(`Kafka Connect returned ${res.status}`);
  },

  async "kafka-connect"() {
    const res = await fetch(config.kafkaConnect.url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  },

  async minio() {
    const res = await fetch(
      `${config.minio.endpoint}/minio/health/live`
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
  },

  async "schema-registry"() {
    const res = await fetch(
      `${config.schemaRegistry.url}/subjects`
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
  },
};

export function createHealthChecker(): HealthChecker {
  return {
    async checkAll() {
      const entries = await Promise.all(
        VALID_SERVICES.map(async (name) => [
          name,
          await timed(checks[name]),
        ])
      );
      return Object.fromEntries(entries);
    },

    async checkService(name: string) {
      if (!VALID_SERVICES.includes(name as ServiceName)) {
        throw new Error(`Unknown service: ${name}`);
      }
      return timed(checks[name as ServiceName]);
    },
  };
}
