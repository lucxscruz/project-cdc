.PHONY: help up down restart logs status connectors \
       fake-pg-customers fake-pg-products fake-pg-orders \
       fake-mysql-employees fake-mysql-departments fake-mysql-audit fake-all

ROWS     ?= 10
INTERVAL ?= 0.5
COMPOSE  := docker compose -f docker/docker-compose.yml
FAKE     := $(COMPOSE) run --rm --build fake-data

help: ## Mostra os comandos disponiveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'

# ── Plataforma ────────────────────────────────────────────────────────

up: ## Sobe toda a plataforma e registra os connectors
	@echo "Starting CDC Platform..."
	$(COMPOSE) up -d
	@echo "Waiting for Kafka Connect..."
	@until curl -sf http://localhost:8083/connectors > /dev/null 2>&1; do sleep 3; done
	@echo "Registering CDC connectors..."
	@bash docker/connectors/register-all.sh
	@echo ""
	@echo "CDC Platform ready!"
	@echo ""
	@echo "  Web Panel:         http://localhost:5173"
	@echo "  Superset (SQL):    http://localhost:8088  (admin/admin)"
	@echo "  Redpanda Console:  http://localhost:8080"
	@echo "  Grafana:           http://localhost:3000  (admin/admin)"
	@echo "  Trino:             http://localhost:8085"
	@echo "  MinIO Console:     http://localhost:19001  (minioadmin/minioadmin)"
	@echo "  BFF API:           http://localhost:3001/api"

down: ## Para toda a plataforma
	@echo "Stopping CDC Platform..."
	$(COMPOSE) down
	@echo "CDC Platform stopped."

restart: down up ## Reinicia toda a plataforma

logs: ## Mostra logs dos containers (use SERVICE=nome para filtrar)
	$(COMPOSE) logs -f $(SERVICE)

status: ## Mostra status dos containers e connectors
	@$(COMPOSE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" | head -20
	@echo ""
	@echo "Connectors:"
	@curl -s 'http://localhost:8083/connectors?expand=status' 2>/dev/null | \
		jq -r '.[] | "  \(.status.name): \(.status.connector.state) [\(.status.tasks[0].state // "no task")]"' 2>/dev/null || \
		echo "  Kafka Connect not available"

connectors: ## Registra/re-registra os connectors CDC
	@bash docker/connectors/register-all.sh

# ── PostgreSQL ────────────────────────────────────────────────────────

fake-pg-customers: ## Insere customers fake no Postgres (ROWS=10 INTERVAL=0.5)
	$(FAKE) --db postgres --table customers --rows $(ROWS) --interval $(INTERVAL)

fake-pg-products: ## Insere products fake no Postgres
	$(FAKE) --db postgres --table products --rows $(ROWS) --interval $(INTERVAL)

fake-pg-orders: ## Insere orders fake no Postgres
	$(FAKE) --db postgres --table orders --rows $(ROWS) --interval $(INTERVAL)

# ── MySQL ─────────────────────────────────────────────────────────────

fake-mysql-employees: ## Insere employees fake no MySQL
	$(FAKE) --db mysql --table employees --rows $(ROWS) --interval $(INTERVAL)

fake-mysql-departments: ## Insere departments fake no MySQL
	$(FAKE) --db mysql --table departments --rows $(ROWS) --interval $(INTERVAL)

fake-mysql-audit: ## Insere audit_log fake no MySQL
	$(FAKE) --db mysql --table audit_log --rows $(ROWS) --interval $(INTERVAL)

# ── Atalhos ───────────────────────────────────────────────────────────

fake-all: ## Insere dados em todas as tabelas (Postgres + MySQL)
	$(FAKE) --db postgres --table customers --rows $(ROWS) --interval $(INTERVAL)
	$(FAKE) --db postgres --table products  --rows $(ROWS) --interval $(INTERVAL)
	$(FAKE) --db postgres --table orders    --rows $(ROWS) --interval $(INTERVAL)
	$(FAKE) --db mysql    --table employees --rows $(ROWS) --interval $(INTERVAL)
	$(FAKE) --db mysql    --table departments --rows $(ROWS) --interval $(INTERVAL)
	$(FAKE) --db mysql    --table audit_log --rows $(ROWS) --interval $(INTERVAL)
