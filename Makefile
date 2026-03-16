FRONTEND_DIR := frontend
BACKEND_DIR := backend
VITE_BIN := ./node_modules/.bin/vite
TSC_BIN := ./node_modules/.bin/tsc
FRONTEND_BIND_HOST := 0.0.0.0
FRONTEND_PORT := 5173
PREVIEW_PORT := 4173
BACKEND_PORT := $(shell test -f $(BACKEND_DIR)/.env && sed -n 's/^PORT=//p' $(BACKEND_DIR)/.env | tail -n 1 || printf '8080')
FRONTEND_URL := http://localhost:$(FRONTEND_PORT)
PREVIEW_URL := http://localhost:$(PREVIEW_PORT)
BACKEND_URL := http://localhost:$(BACKEND_PORT)
LAN_IP := $(shell route -n get default 2>/dev/null | awk '/interface:/{print $$2}' | xargs -I{} sh -c 'ipconfig getifaddr "$$1" 2>/dev/null' sh {})
LAN_FRONTEND_URL := $(if $(LAN_IP),http://$(LAN_IP):$(FRONTEND_PORT),)
LAN_PREVIEW_URL := $(if $(LAN_IP),http://$(LAN_IP):$(PREVIEW_PORT),)
LAN_BACKEND_URL := $(if $(LAN_IP),http://$(LAN_IP):$(BACKEND_PORT),)

.PHONY: help install frontend-install backend-tidy dev stop-dev dev-client dev-server device-preview device-serve build build-client build-server preview test clean

help:
	@echo "Available targets:"
	@echo "  make install         # install frontend deps and tidy backend module"
	@echo "  make dev-client      # start Vite dev server on $(FRONTEND_URL)"
	@echo "  make dev-server      # start Go API server on $(BACKEND_URL)"
	@echo "  make dev             # start frontend and backend together and print URLs"
	@echo "  make device-preview  # build and serve a Kindle-friendly frontend on $(PREVIEW_URL)"
	@echo "  make device-serve    # build frontend and serve everything from backend on $(BACKEND_URL)"
	@echo "  make stop-dev        # stop leftover frontend/backend dev processes on their ports"
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

dev: stop-dev
	@echo "Frontend: $(FRONTEND_URL)"
	@echo "Backend:  $(BACKEND_URL)"
	@test -n "$(LAN_FRONTEND_URL)" && echo "Frontend (LAN): $(LAN_FRONTEND_URL)" || true
	@test -n "$(LAN_BACKEND_URL)" && echo "Backend (LAN):  $(LAN_BACKEND_URL)" || true
	@server_pid=; \
	client_pid=; \
	trap 'test -n "$$server_pid" && kill $$server_pid 2>/dev/null || true; test -n "$$client_pid" && kill $$client_pid 2>/dev/null || true' INT TERM EXIT; \
	$(MAKE) --no-print-directory dev-server & server_pid=$$!; \
	$(MAKE) --no-print-directory dev-client & client_pid=$$!; \
	wait $$server_pid $$client_pid

stop-dev:
	@frontend_pid=$$(lsof -tiTCP:$(FRONTEND_PORT) -sTCP:LISTEN 2>/dev/null || true); \
	if test -n "$$frontend_pid"; then \
		echo "Stopping frontend on port $(FRONTEND_PORT): $$frontend_pid"; \
		kill $$frontend_pid 2>/dev/null || true; \
	fi
	@preview_pid=$$(lsof -tiTCP:$(PREVIEW_PORT) -sTCP:LISTEN 2>/dev/null || true); \
	if test -n "$$preview_pid"; then \
		echo "Stopping preview on port $(PREVIEW_PORT): $$preview_pid"; \
		kill $$preview_pid 2>/dev/null || true; \
	fi
	@backend_pid=$$(lsof -tiTCP:$(BACKEND_PORT) -sTCP:LISTEN 2>/dev/null || true); \
	if test -n "$$backend_pid"; then \
		echo "Stopping backend on port $(BACKEND_PORT): $$backend_pid"; \
		kill $$backend_pid 2>/dev/null || true; \
	fi

dev-client:
	cd $(FRONTEND_DIR) && $(VITE_BIN) --host $(FRONTEND_BIND_HOST) --port $(FRONTEND_PORT) --strictPort

dev-server:
	cd $(BACKEND_DIR) && go run ./cmd/api

device-preview: stop-dev build-client
	@echo "Frontend preview: $(PREVIEW_URL)"
	@test -n "$(LAN_PREVIEW_URL)" && echo "Frontend preview (LAN): $(LAN_PREVIEW_URL)" || true
	@echo "Backend:  $(BACKEND_URL)"
	@test -n "$(LAN_BACKEND_URL)" && echo "Backend (LAN):  $(LAN_BACKEND_URL)" || true
	@server_pid=; \
	preview_pid=; \
	trap 'test -n "$$server_pid" && kill $$server_pid 2>/dev/null || true; test -n "$$preview_pid" && kill $$preview_pid 2>/dev/null || true' INT TERM EXIT; \
	$(MAKE) --no-print-directory dev-server & server_pid=$$!; \
	cd $(FRONTEND_DIR) && $(VITE_BIN) preview --host $(FRONTEND_BIND_HOST) --port $(PREVIEW_PORT) --strictPort & preview_pid=$$!; \
	wait $$server_pid $$preview_pid

device-serve: stop-dev build-client
	@echo "Dashboard: $(BACKEND_URL)"
	@test -n "$(LAN_BACKEND_URL)" && echo "Dashboard (LAN): $(LAN_BACKEND_URL)" || true
	@echo "Open /?kiosk=... on the device if kiosk mode is enabled."
	cd $(BACKEND_DIR) && go run ./cmd/api

build: build-client build-server

build-client:
	cd $(FRONTEND_DIR) && $(TSC_BIN) && $(VITE_BIN) build

build-server:
	cd $(BACKEND_DIR) && go build ./...

preview:
	cd $(FRONTEND_DIR) && $(VITE_BIN) preview --host $(FRONTEND_BIND_HOST) --port $(PREVIEW_PORT) --strictPort

test:
	cd $(BACKEND_DIR) && go test ./...

clean:
	rm -rf $(FRONTEND_DIR)/dist
