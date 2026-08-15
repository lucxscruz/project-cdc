import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { databaseRoutes } from "../../src/routes/databases.js";
import { DatabaseClient } from "../../src/services/database-client.js";

function buildMockDbClient(): DatabaseClient {
  return {
    listDatabases: vi.fn().mockResolvedValue([
      { name: "postgres", type: "postgresql", host: "postgres", port: 5432 },
      { name: "mysql", type: "mysql", host: "mysql", port: 3306 },
    ]),
    listTables: vi.fn().mockResolvedValue([
      { name: "customers", schema: "public", rowCount: 3 },
      { name: "orders", schema: "public", rowCount: 3 },
    ]),
    listColumns: vi.fn().mockResolvedValue([
      { name: "id", type: "integer", nullable: false, isPrimaryKey: true },
      { name: "name", type: "varchar", nullable: false, isPrimaryKey: false },
      { name: "email", type: "varchar", nullable: false, isPrimaryKey: false },
    ]),
    preview: vi.fn().mockResolvedValue({
      columns: ["id", "name", "email"],
      rows: [{ id: 1, name: "Alice", email: "alice@example.com" }],
    }),
  };
}

describe("GET /api/databases", () => {
  it("returns list of configured databases", async () => {
    const app = Fastify();
    app.decorate("databaseClient", buildMockDbClient());
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({ method: "GET", url: "/api/databases" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });
});

describe("GET /api/databases/:db/tables", () => {
  it("returns tables for a database", async () => {
    const app = Fastify();
    const client = buildMockDbClient();
    app.decorate("databaseClient", client);
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({ method: "GET", url: "/api/databases/postgres/tables" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(client.listTables).toHaveBeenCalledWith("postgres");
  });
});

describe("GET /api/databases/:db/tables/:table/columns", () => {
  it("returns columns for a table", async () => {
    const app = Fastify();
    const client = buildMockDbClient();
    app.decorate("databaseClient", client);
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({
      method: "GET",
      url: "/api/databases/postgres/tables/customers/columns",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
    expect(res.json()[0].isPrimaryKey).toBe(true);
  });
});

describe("GET /api/databases/:db/tables/:table/preview", () => {
  it("returns preview rows", async () => {
    const app = Fastify();
    const client = buildMockDbClient();
    app.decorate("databaseClient", client);
    await app.register(databaseRoutes, { prefix: "/api/databases" });

    const res = await app.inject({
      method: "GET",
      url: "/api/databases/postgres/tables/customers/preview",
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.columns).toContain("id");
    expect(body.rows).toHaveLength(1);
  });
});
