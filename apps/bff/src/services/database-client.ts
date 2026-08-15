import pg from "pg";
import mysql from "mysql2/promise";
import { config } from "../config.js";

export interface DatabaseInfo {
  name: string;
  type: "postgresql" | "mysql";
  host: string;
  port: number;
}

export interface TableInfo {
  name: string;
  schema: string;
  rowCount: number | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface PreviewResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface DatabaseClient {
  listDatabases(): Promise<DatabaseInfo[]>;
  listTables(db: string): Promise<TableInfo[]>;
  listColumns(db: string, table: string): Promise<ColumnInfo[]>;
  preview(db: string, table: string, limit?: number): Promise<PreviewResult>;
}

export function createDatabaseClient(): DatabaseClient {
  async function withPg<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client(config.postgres);
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async function withMysql<T>(
    fn: (conn: mysql.Connection) => Promise<T>
  ): Promise<T> {
    const conn = await mysql.createConnection(config.mysql);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  return {
    async listDatabases(): Promise<DatabaseInfo[]> {
      return [
        { name: "postgres", type: "postgresql", host: config.postgres.host, port: config.postgres.port },
        { name: "mysql", type: "mysql", host: config.mysql.host, port: config.mysql.port },
      ];
    },

    async listTables(db: string): Promise<TableInfo[]> {
      if (db === "postgres") {
        return withPg(async (client) => {
          const res = await client.query(`
            SELECT t.table_name as name, t.table_schema as schema,
                   s.n_live_tup as row_count
            FROM information_schema.tables t
            LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
          `);
          return res.rows.map((r) => ({
            name: r.name,
            schema: r.schema,
            rowCount: r.row_count ? Number(r.row_count) : null,
          }));
        });
      }
      return withMysql(async (conn) => {
        const [rows] = await conn.query(`
          SELECT TABLE_NAME as name, TABLE_SCHEMA as \`schema\`,
                 TABLE_ROWS as row_count
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME
        `, [config.mysql.database]);
        return (rows as any[]).map((r) => ({
          name: r.name,
          schema: r.schema,
          rowCount: r.row_count ? Number(r.row_count) : null,
        }));
      });
    },

    async listColumns(db: string, table: string): Promise<ColumnInfo[]> {
      if (db === "postgres") {
        return withPg(async (client) => {
          const res = await client.query(`
            SELECT c.column_name as name, c.data_type as type,
                   c.is_nullable = 'YES' as nullable,
                   COALESCE(tc.constraint_type = 'PRIMARY KEY', false) as is_primary_key
            FROM information_schema.columns c
            LEFT JOIN information_schema.key_column_usage kcu
              ON kcu.column_name = c.column_name AND kcu.table_name = c.table_name
            LEFT JOIN information_schema.table_constraints tc
              ON tc.constraint_name = kcu.constraint_name AND tc.constraint_type = 'PRIMARY KEY'
            WHERE c.table_schema = 'public' AND c.table_name = $1
            ORDER BY c.ordinal_position
          `, [table]);
          return res.rows.map((r) => ({
            name: r.name,
            type: r.type,
            nullable: r.nullable,
            isPrimaryKey: r.is_primary_key,
          }));
        });
      }
      return withMysql(async (conn) => {
        const [rows] = await conn.query(`
          SELECT COLUMN_NAME as name, DATA_TYPE as type,
                 IS_NULLABLE = 'YES' as nullable,
                 COLUMN_KEY = 'PRI' as is_primary_key
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [config.mysql.database, table]);
        return (rows as any[]).map((r) => ({
          name: r.name,
          type: r.type,
          nullable: Boolean(r.nullable),
          isPrimaryKey: Boolean(r.is_primary_key),
        }));
      });
    },

    async preview(db: string, table: string, limit = 50): Promise<PreviewResult> {
      if (db === "postgres") {
        return withPg(async (client) => {
          const res = await client.query(
            `SELECT * FROM "${table}" LIMIT $1`, [limit]
          );
          return {
            columns: res.fields.map((f) => f.name),
            rows: res.rows,
          };
        });
      }
      return withMysql(async (conn) => {
        const [rows, fields] = await conn.query(
          `SELECT * FROM \`${table}\` LIMIT ?`, [limit]
        );
        return {
          columns: (fields as any[]).map((f) => f.name),
          rows: rows as any[],
        };
      });
    },
  };
}
