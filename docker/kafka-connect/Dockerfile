FROM debezium/connect:2.5

# Copy S3 Sink Connector plugin (pre-downloaded)
COPY s3-plugin/ /kafka/connect/kafka-connect-s3/

# Copy Avro/Schema Registry converter JARs to the Kafka libs directory
# These must be on the worker classpath (not plugin path) for converters to work
USER root
RUN cp /kafka/connect/kafka-connect-s3/kafka-connect-avro-converter-*.jar \
       /kafka/connect/kafka-connect-s3/kafka-connect-avro-data-*.jar \
       /kafka/connect/kafka-connect-s3/kafka-avro-serializer-*.jar \
       /kafka/connect/kafka-connect-s3/kafka-schema-converter-*.jar \
       /kafka/connect/kafka-connect-s3/kafka-schema-registry-client-*.jar \
       /kafka/connect/kafka-connect-s3/kafka-schema-serializer-*.jar \
       /kafka/connect/kafka-connect-s3/avro-1.11.3.jar \
       /kafka/connect/kafka-connect-s3/common-utils-*.jar \
       /kafka/connect/kafka-connect-s3/guava-*.jar \
       /kafka/connect/kafka-connect-s3/failureaccess-*.jar \
       /kafka/libs/
USER kafka
