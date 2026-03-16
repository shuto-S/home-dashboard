FRONTEND_DIR := frontend
BACKEND_DIR := backend
VITE_BIN := ./node_modules/.bin/vite
TSC_BIN := ./node_modules/.bin/tsc

.PHONY: help install frontend-install backend-tidy dev dev-client dev-server build build-client build-server preview test clean

help:
	@echo "Available targets:"
	@echo "  make install         # install frontend deps and tidy backend module"
	@echo "  make dev-client      # start Vite dev server"
	@echo "  make dev-server      # start Go API server"
	@echo "  make dev             # print both dev commands"
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
	@echo "Run in separate terminals:"
	@echo "  make dev-server"
	@echo "  make dev-client"

dev-client:
	cd $(FRONTEND_DIR) && $(VITE_BIN)

dev-server:
	cd $(BACKEND_DIR) && go run ./cmd/api

build: build-client build-server

build-client:
	cd $(FRONTEND_DIR) && $(TSC_BIN) && $(VITE_BIN) build

build-server:
	cd $(BACKEND_DIR) && go build ./...

preview:
	cd $(FRONTEND_DIR) && $(VITE_BIN) preview

test:
	cd $(BACKEND_DIR) && go test ./...

clean:
	rm -rf $(FRONTEND_DIR)/dist
