FROM debezium/connect:2.5

# Install the Confluent S3 Sink Connector plugin.
#
# debezium/connect:2.5 does not ship confluent-hub, so we download the
# self-contained ZIP from Confluent Hub directly and unpack the JARs into
# the Kafka Connect plugin path (/kafka/connect/).
#
# Plugin version: kafka-connect-s3 10.5.14 (matches Confluent Platform 7.5.x,
# compatible with any Kafka 3.x broker).

ARG S3_CONNECTOR_VERSION=10.5.14
ARG S3_CONNECTOR_ZIP=confluentinc-kafka-connect-s3-${S3_CONNECTOR_VERSION}.zip

RUN curl -fsSL \
      "https://d1i4a15mxbxib1.cloudfront.net/api/plugins/confluentinc/kafka-connect-s3/versions/${S3_CONNECTOR_VERSION}/${S3_CONNECTOR_ZIP}" \
      -o /tmp/${S3_CONNECTOR_ZIP} \
    && unzip -q /tmp/${S3_CONNECTOR_ZIP} -d /tmp/kafka-connect-s3 \
    && mkdir -p /kafka/connect/kafka-connect-s3 \
    && cp -r /tmp/kafka-connect-s3/confluentinc-kafka-connect-s3-${S3_CONNECTOR_VERSION}/lib/* \
             /kafka/connect/kafka-connect-s3/ \
    && rm -rf /tmp/kafka-connect-s3 /tmp/${S3_CONNECTOR_ZIP}

# debezium/connect:2.5 already bundles the Apicurio Registry converter JARs
# at /kafka/connect/debezium-connector-*/apicurio-*.jar via the base image's
# plugin installation, so no additional steps are needed for that converter.
