import { config } from "../config.js";

export interface TemplateInfo {
  id: string;
  name: string;
  type: "source" | "sink";
}

export interface GenerateRequest {
  templateId: string;
  database: string;
  tables: string[];
  options?: {
    snapshotMode?: string;
    topicPrefix?: string;
    connectorName?: string;
  };
}

export interface GeneratedConnector {
  name: string;
  config: Record<string, string>;
}

export interface TemplateEngine {
  listTemplates(): TemplateInfo[];
  generate(request: GenerateRequest): GeneratedConnector;
}

const TEMPLATES: TemplateInfo[] = [
  { id: "debezium-postgres", name: "Debezium PostgreSQL Source", type: "source" },
  { id: "debezium-mysql", name: "Debezium MySQL Source", type: "source" },
  { id: "s3-sink-minio", name: "S3 Sink (MinIO)", type: "sink" },
];

export function createTemplateEngine(): TemplateEngine {
  return {
    listTemplates() {
      return TEMPLATES;
    },

    generate(request: GenerateRequest): GeneratedConnector {
      const { templateId, database, tables, options = {} } = request;
      const prefix = options.topicPrefix ?? database;
      const snapshot = options.snapshotMode ?? "initial";

      switch (templateId) {
        case "debezium-postgres": {
          const name = options.connectorName ?? `${prefix}-pg-source`;
          return {
            name,
            config: {
              "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
              "database.hostname": config.postgres.host,
              "database.port": String(config.postgres.port),
              "database.user": "debezium",
              "database.password": "debezium",
              "database.dbname": config.postgres.database,
              "topic.prefix": prefix,
              "schema.include.list": "public",
              "table.include.list": tables.join(","),
              "plugin.name": "pgoutput",
              "publication.name": "debezium_publication",
              "slot.name": `debezium_${name.replace(/[^a-z0-9]/g, "_")}`,
              "snapshot.mode": snapshot,
              "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "key.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "key.converter.apicurio.registry.auto-register": "true",
              "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "value.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "value.converter.apicurio.registry.auto-register": "true",
            },
          };
        }

        case "debezium-mysql": {
          const name = options.connectorName ?? `${prefix}-mysql-source`;
          return {
            name,
            config: {
              "connector.class": "io.debezium.connector.mysql.MySqlConnector",
              "database.hostname": config.mysql.host,
              "database.port": String(config.mysql.port),
              "database.user": "debezium",
              "database.password": "debezium",
              "database.server.id": String(1001 + Math.floor(Math.random() * 1000)),
              "topic.prefix": prefix,
              "database.include.list": config.mysql.database,
              "table.include.list": tables.join(","),
              "schema.history.internal.kafka.bootstrap.servers": config.kafka.brokers.join(","),
              "schema.history.internal.kafka.topic": `schema-changes.${name}`,
              "snapshot.mode": snapshot,
              "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "key.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "key.converter.apicurio.registry.auto-register": "true",
              "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "value.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "value.converter.apicurio.registry.auto-register": "true",
            },
          };
        }

        case "s3-sink-minio": {
          const name = options.connectorName ?? `${prefix}-s3-sink`;
          const topicsRegex = tables
            .map((t) => `${prefix}\\.${t.replace(".", "\\\\.")}`)
            .join("|");
          return {
            name,
            config: {
              "connector.class": "io.confluent.connect.s3.S3SinkConnector",
              "tasks.max": "1",
              "topics.regex": topicsRegex,
              "s3.bucket.name": "raw",
              "s3.region": "us-east-1",
              "store.url": config.minio.endpoint,
              "format.class": "io.confluent.connect.s3.format.json.JsonFormat",
              "flush.size": "100",
              "rotate.schedule.interval.ms": "60000",
              "partitioner.class": "io.confluent.connect.storage.partitioner.DailyPartitioner",
              "path.format": "'${topic}/'YYYY-MM-dd",
              "locale": "en-US",
              "timezone": "UTC",
              "storage.class": "io.confluent.connect.s3.storage.S3Storage",
              "key.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "key.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "value.converter": "io.apicurio.registry.utils.converter.ExtJsonConverter",
              "value.converter.apicurio.registry.url": `${config.schemaRegistry.url}/apis/registry/v2`,
              "aws.access.key.id": config.minio.accessKey,
              "aws.secret.access.key": config.minio.secretKey,
            },
          };
        }

        default:
          throw new Error(`Unknown template: ${templateId}`);
      }
    },
  };
}
