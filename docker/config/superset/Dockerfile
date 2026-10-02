FROM apache/superset:latest

USER root
RUN /app/.venv/bin/python -m ensurepip 2>/dev/null; \
    /app/.venv/bin/python -m pip install trino || pip install trino
USER superset
