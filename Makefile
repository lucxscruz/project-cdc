.PHONY: help venv fake-pg-customers fake-pg-products fake-pg-orders fake-mysql-employees fake-mysql-departments fake-mysql-audit fake-all

PYTHON   := scripts/.venv/bin/python
ROWS     ?= 10
INTERVAL ?= 0.5

help: ## Mostra os comandos disponiveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2}'

venv: ## Cria virtualenv e instala dependencias
	python3 -m venv scripts/.venv
	scripts/.venv/bin/pip install -q -r scripts/requirements.txt
	@echo "Virtualenv pronta em scripts/.venv"

# ── PostgreSQL ────────────────────────────────────────────────────────

fake-pg-customers: ## Insere customers fake no Postgres (ROWS=10 INTERVAL=0.5)
	$(PYTHON) scripts/fake_data.py --db postgres --table customers --rows $(ROWS) --interval $(INTERVAL)

fake-pg-products: ## Insere products fake no Postgres
	$(PYTHON) scripts/fake_data.py --db postgres --table products --rows $(ROWS) --interval $(INTERVAL)

fake-pg-orders: ## Insere orders fake no Postgres
	$(PYTHON) scripts/fake_data.py --db postgres --table orders --rows $(ROWS) --interval $(INTERVAL)

# ── MySQL ─────────────────────────────────────────────────────────────

fake-mysql-employees: ## Insere employees fake no MySQL
	$(PYTHON) scripts/fake_data.py --db mysql --table employees --rows $(ROWS) --interval $(INTERVAL)

fake-mysql-departments: ## Insere departments fake no MySQL
	$(PYTHON) scripts/fake_data.py --db mysql --table departments --rows $(ROWS) --interval $(INTERVAL)

fake-mysql-audit: ## Insere audit_log fake no MySQL
	$(PYTHON) scripts/fake_data.py --db mysql --table audit_log --rows $(ROWS) --interval $(INTERVAL)

# ── Atalhos ───────────────────────────────────────────────────────────

fake-all: ## Insere dados em todas as tabelas (Postgres + MySQL)
	$(PYTHON) scripts/fake_data.py --db postgres --table customers --rows $(ROWS) --interval $(INTERVAL)
	$(PYTHON) scripts/fake_data.py --db postgres --table products  --rows $(ROWS) --interval $(INTERVAL)
	$(PYTHON) scripts/fake_data.py --db postgres --table orders    --rows $(ROWS) --interval $(INTERVAL)
	$(PYTHON) scripts/fake_data.py --db mysql    --table employees --rows $(ROWS) --interval $(INTERVAL)
	$(PYTHON) scripts/fake_data.py --db mysql    --table departments --rows $(ROWS) --interval $(INTERVAL)
	$(PYTHON) scripts/fake_data.py --db mysql    --table audit_log --rows $(ROWS) --interval $(INTERVAL)
