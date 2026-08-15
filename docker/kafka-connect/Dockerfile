# Stage 1: grab S3 Sink Connector from Confluent's image
FROM confluentinc/cp-kafka-connect:7.7.0 AS s3-source

# Stage 2: Debezium Connect + S3 plugin
FROM debezium/connect:2.5

# Copy the S3 Sink Connector plugin from the Confluent image
COPY --from=s3-source /usr/share/confluent-hub-components/confluentinc-kafka-connect-s3 /kafka/connect/kafka-connect-s3
