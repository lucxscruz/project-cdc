"""
Gera e insere dados fake nas tabelas do CDC para testar o pipeline.

Uso:
    python scripts/fake_data.py --db postgres --table customers --rows 10
    python scripts/fake_data.py --db mysql --table employees --rows 5 --interval 1.0
"""

import argparse
import time
import sys

from faker import Faker
import os
import psycopg2
import mysql.connector

fake = Faker("pt_BR")

PG_HOST = os.environ.get("PG_HOST", "localhost")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
MYSQL_HOST = os.environ.get("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3307"))

# ── Conexões ─────────────────────────────────────────────────────────

def pg_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT,
        user="postgres", password="postgres",
        dbname="cdc_source",
    )

def mysql_conn():
    return mysql.connector.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user="root", password="root",
        database="cdc_source",
    )

# ── Geradores por tabela ─────────────────────────────────────────────

POSTGRES_GENERATORS = {
    "customers": lambda cur: cur.execute(
        "INSERT INTO customers (name, email) VALUES (%s, %s) RETURNING id",
        (fake.name(), fake.email()),
    ),
    "products": lambda cur: cur.execute(
        "INSERT INTO products (name, price, stock, category) VALUES (%s, %s, %s, %s) RETURNING id",
        (fake.catch_phrase(), round(fake.pyfloat(min_value=10, max_value=5000, right_digits=2), 2),
         fake.random_int(min=0, max=500), fake.random_element(["electronics", "furniture", "books", "clothing"])),
    ),
    "orders": lambda cur: (
        cur.execute("SELECT id FROM customers ORDER BY random() LIMIT 1"),
        cur.execute(
            "INSERT INTO orders (customer_id, total, status) VALUES (%s, %s, %s) RETURNING id",
            (cur.fetchone()[0] if False else _orders_helper(cur),
             round(fake.pyfloat(min_value=10, max_value=10000, right_digits=2), 2),
             fake.random_element(["pending", "completed", "shipped", "cancelled"])),
        ),
    ),
}

def _orders_helper(cur):
    cur.execute("SELECT id FROM customers ORDER BY random() LIMIT 1")
    row = cur.fetchone()
    if not row:
        raise RuntimeError("Nenhum customer encontrado. Insira customers primeiro.")
    return row[0]

# Corrige o generator de orders para ser mais simples
def _insert_order(cur):
    customer_id = _orders_helper(cur)
    cur.execute(
        "INSERT INTO orders (customer_id, total, status) VALUES (%s, %s, %s) RETURNING id",
        (customer_id,
         round(fake.pyfloat(min_value=10, max_value=10000, right_digits=2), 2),
         fake.random_element(["pending", "completed", "shipped", "cancelled"])),
    )

POSTGRES_GENERATORS["orders"] = _insert_order

MYSQL_GENERATORS = {
    "employees": lambda cur: cur.execute(
        "INSERT INTO employees (name, department, salary) VALUES (%s, %s, %s)",
        (fake.name(),
         fake.random_element(["Engineering", "Marketing", "Finance", "HR", "Sales"]),
         round(fake.pyfloat(min_value=3000, max_value=25000, right_digits=2), 2)),
    ),
    "departments": lambda cur: cur.execute(
        "INSERT INTO departments (name, budget, location) VALUES (%s, %s, %s)",
        (fake.bs().title(),
         round(fake.pyfloat(min_value=50000, max_value=1000000, right_digits=2), 2),
         fake.city()),
    ),
    "audit_log": lambda cur: cur.execute(
        "INSERT INTO audit_log (entity, action, payload) VALUES (%s, %s, %s)",
        (fake.random_element(["employees", "departments"]),
         fake.random_element(["INSERT", "UPDATE", "DELETE"]),
         fake.json(data_columns={"id": "pyint", "detail": "sentence"}, num_rows=1)),
    ),
}

# ── Main ──────────────────────────────────────────────────────────────

DB_MAP = {
    "postgres": {"conn": pg_conn, "generators": POSTGRES_GENERATORS},
    "mysql":    {"conn": mysql_conn, "generators": MYSQL_GENERATORS},
}

def run(db_name: str, table: str, rows: int, interval: float):
    cfg = DB_MAP[db_name]
    if table not in cfg["generators"]:
        tables = ", ".join(cfg["generators"])
        print(f"Tabela '{table}' invalida para {db_name}. Opcoes: {tables}")
        sys.exit(1)

    generator = cfg["generators"][table]
    conn = cfg["conn"]()
    cur = conn.cursor()

    print(f"Inserindo {rows} row(s) em {db_name}.{table} (intervalo: {interval}s)...")

    for i in range(1, rows + 1):
        generator(cur)
        conn.commit()
        print(f"  [{i}/{rows}] inserido")
        if interval > 0 and i < rows:
            time.sleep(interval)

    cur.close()
    conn.close()
    print("Concluido.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Insere dados fake para testar CDC")
    parser.add_argument("--db", required=True, choices=["postgres", "mysql"])
    parser.add_argument("--table", required=True)
    parser.add_argument("--rows", type=int, default=10)
    parser.add_argument("--interval", type=float, default=0.5,
                        help="Segundos entre cada insert (0 = sem delay)")
    args = parser.parse_args()
    run(args.db, args.table, args.rows, args.interval)
