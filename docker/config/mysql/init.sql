-- Create application database
CREATE DATABASE IF NOT EXISTS cdc_source;
USE cdc_source;

-- Create debezium user with replication permissions
CREATE USER IF NOT EXISTS 'debezium'@'%' IDENTIFIED BY 'debezium';
GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'debezium'@'%';
FLUSH PRIVILEGES;

-- Create tables
CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    salary DECIMAL(10,2) NOT NULL,
    hired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    budget DECIMAL(12,2) NOT NULL,
    location VARCHAR(255)
);

CREATE TABLE audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    payload JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed data
INSERT INTO departments (name, budget, location) VALUES
    ('Engineering', 500000.00, 'Sao Paulo'),
    ('Marketing', 200000.00, 'Rio de Janeiro'),
    ('Finance', 300000.00, 'Sao Paulo');

INSERT INTO employees (name, department, salary) VALUES
    ('Daniel Costa', 'Engineering', 12000.00),
    ('Elena Souza', 'Marketing', 8500.00),
    ('Felipe Lima', 'Finance', 10000.00);

INSERT INTO audit_log (entity, action, payload) VALUES
    ('employees', 'INSERT', '{"id": 1, "name": "Daniel Costa"}'),
    ('departments', 'INSERT', '{"id": 1, "name": "Engineering"}');
