-- Enable logical replication (set via command args, this script handles schema)

-- Create replication user for Debezium
CREATE ROLE debezium WITH LOGIN PASSWORD 'debezium' REPLICATION;

-- Create application database
CREATE DATABASE cdc_source;
\c cdc_source;

-- Grant permissions to debezium user
GRANT ALL PRIVILEGES ON DATABASE cdc_source TO debezium;

-- Create tables
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    category VARCHAR(100)
);

-- Grant table permissions to debezium
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium;

-- Create publication for Debezium
CREATE PUBLICATION debezium_publication FOR ALL TABLES;

-- Seed data
INSERT INTO customers (name, email) VALUES
    ('Alice Silva', 'alice@example.com'),
    ('Bob Santos', 'bob@example.com'),
    ('Carol Oliveira', 'carol@example.com');

INSERT INTO products (name, price, stock, category) VALUES
    ('Notebook', 2999.99, 50, 'electronics'),
    ('Mouse', 79.90, 200, 'electronics'),
    ('Cadeira Gamer', 1299.00, 30, 'furniture');

INSERT INTO orders (customer_id, total, status) VALUES
    (1, 3079.89, 'completed'),
    (2, 79.90, 'pending'),
    (3, 1299.00, 'shipped');
