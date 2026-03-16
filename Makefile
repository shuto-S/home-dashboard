FRONTEND_DIR := frontend
BACKEND_DIR := backend
VITE_BIN := ./node_modules/.bin/vite
TSC_BIN := ./node_modules/.bin/tsc
FRONTEND_PORT := 5173
BACKEND_PORT := $(shell test -f $(BACKEND_DIR)/.env && sed -n 's/^PORT=//p' $(BACKEND_DIR)/.env | tail -n 1 || printf '8080')
FRONTEND_URL := http://localhost:$(FRONTEND_PORT)
BACKEND_URL := http://localhost:$(BACKEND_PORT)

.PHONY: help install frontend-install backend-tidy dev dev-client dev-server build build-client build-server preview test clean

help:
	@echo "Available targets:"
	@echo "  make install         # install frontend deps and tidy backend module"
	@echo "  make dev-client      # start Vite dev server on $(FRONTEND_URL)"
	@echo "  make dev-server      # start Go API server on $(BACKEND_URL)"
	@echo "  make dev             # start frontend and backend together and print URLs"
	@echo "  make build           # build frontend and backend"
	@echo "  make build-client    # build frontend only"
	@echo "  make build-server    # build backend only"
	@echo "  make preview         # preview frontend build"
	@echo "  make test            # compile-check backend packages"
	@echo "  make clean           # remove build artifacts"

install: frontend-install backend-tidy

frontend-install:
	cd $(FRONTEND_DIR) && npm install

backend-tidy:
	cd $(BACKEND_DIR) && go mod tidy

dev:
	@echo "Frontend: $(FRONTEND_URL)"
	@echo "Backend:  $(BACKEND_URL)"
	@server_pid=; \
	client_pid=; \
	trap 'test -n "$$server_pid" && kill $$server_pid 2>/dev/null || true; test -n "$$client_pid" && kill $$client_pid 2>/dev/null || true' INT TERM EXIT; \
	$(MAKE) --no-print-directory dev-server & server_pid=$$!; \
	$(MAKE) --no-print-directory dev-client & client_pid=$$!; \
	wait $$server_pid $$client_pid

dev-client:
	cd $(FRONTEND_DIR) && $(VITE_BIN) --host localhost --port $(FRONTEND_PORT) --strictPort

dev-server:
	cd $(BACKEND_DIR) && go run ./cmd/api

build: build-client build-server

build-client:
	cd $(FRONTEND_DIR) && $(TSC_BIN) && $(VITE_BIN) build

build-server:
	cd $(BACKEND_DIR) && go build ./...

preview:
	cd $(FRONTEND_DIR) && $(VITE_BIN) preview --host localhost

test:
	cd $(BACKEND_DIR) && go test ./...

clean:
	rm -rf $(FRONTEND_DIR)/dist
