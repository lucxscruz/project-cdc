import { describe, it, expect, beforeAll } from "vitest";
import { getTestBffUrl, waitForServices } from "../setup.js";

describe("BFF API — Databases", () => {
  const bffUrl = getTestBffUrl();

  beforeAll(async () => {
    await waitForServices();
  });

  it("GET /api/databases deve listar postgres e mysql", async () => {
    const res = await fetch(`${bffUrl}/api/databases`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);

    const names = body.map((db: any) => db.name);
    expect(names).toContain("postgres");
    expect(names).toContain("mysql");
  });

  it("GET /api/databases/postgres/tables deve listar tabelas seed", async () => {
    const res = await fetch(`${bffUrl}/api/databases/postgres/tables`);
    const body = await res.json();

    expect(res.status).toBe(200);
    const names = body.map((t: any) => t.name);
    expect(names).toContain("customers");
    expect(names).toContain("orders");
    expect(names).toContain("products");
  });

  it("GET /api/databases/postgres/tables/customers/columns deve retornar colunas", async () => {
    const res = await fetch(
      `${bffUrl}/api/databases/postgres/tables/customers/columns`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const names = body.map((c: any) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("name");
    expect(names).toContain("email");

    const idCol = body.find((c: any) => c.name === "id");
    expect(idCol.isPrimaryKey).toBe(true);
  });

  it("GET /api/databases/postgres/tables/customers/preview deve retornar dados", async () => {
    const res = await fetch(
      `${bffUrl}/api/databases/postgres/tables/customers/preview`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.columns).toContain("name");
    expect(body.columns).toContain("email");
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("GET /api/databases/mysql/tables deve listar tabelas seed", async () => {
    const res = await fetch(`${bffUrl}/api/databases/mysql/tables`);
    const body = await res.json();

    expect(res.status).toBe(200);
    const names = body.map((t: any) => t.name);
    expect(names).toContain("employees");
    expect(names).toContain("departments");
    expect(names).toContain("audit_log");
  });
});
