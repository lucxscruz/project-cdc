export const config = {
  port: parseInt(process.env.PORT ?? "3001"),
  host: process.env.HOST ?? "0.0.0.0",

  postgres: {
    host: process.env.PG_HOST ?? "postgres",
    port: parseInt(process.env.PG_PORT ?? "5432"),
    user: process.env.PG_USER ?? "postgres",
    password: process.env.PG_PASSWORD ?? "postgres",
    database: process.env.PG_DATABASE ?? "cdc_source",
  },

  mysql: {
    host: process.env.MYSQL_HOST ?? "mysql",
    port: parseInt(process.env.MYSQL_PORT ?? "3306"),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "root",
    database: process.env.MYSQL_DATABASE ?? "cdc_source",
  },

  kafkaConnect: {
    url: process.env.KAFKA_CONNECT_URL ?? "http://kafka-connect:8083",
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? "redpanda:29092").split(","),
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "http://minio:9000",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  },

  schemaRegistry: {
    url:
      process.env.SCHEMA_REGISTRY_URL ??
      "http://redpanda:8081",
  },
} as const;
